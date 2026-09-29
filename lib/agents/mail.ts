import { z } from "zod";
import { db, logEvent } from "../db";
import { getBrain, brainAsPrompt, configValue } from "../brains";
import { decide, claudeErrorLabel } from "../claude";
import { checkOutgoing } from "../guardrails";
import { createDraft, sendDraft } from "../drafts";
import { getModes } from "../settings";
import { fetchNew, mailboxReady, mailboxAddress, sendMail, threadContext, type IncomingMail } from "../mail";
import { extractPhones, prettyPhone } from "../phone";
import * as tg from "../telegram";

/**
 * Agent MAIL : boîte commerciale. Trie, répond (cerveau « mail ») et envoie tout numéro de téléphone
 * au groupe Telegram de l'équipe setting pour un rappel immédiat.
 */

const Decision = z.object({
  category: z.string().describe("L'id de catégorie du cerveau (prospect, question, partenariat, support, spam…)"),
  action: z.enum(["reply", "escalate", "forward_support", "ignore"]),
  message: z.string().describe("Le corps du mail de réponse, signature comprise (vide si action ≠ reply)"),
  name: z.string().describe("Prénom et nom de l'expéditeur si connus, sinon vide"),
  reason: z.string().describe("Une phrase pour Luc : pourquoi cette décision"),
  summary: z.string().describe("Résumé du mail en une phrase"),
});

const RULES = `Tu es l'agent mail de Labarile English. Tu lis les mails reçus sur la boîte commerciale, tu les classes et, si c'est utile, tu rédiges la réponse en français, au nom de l'équipe.
La méthode, la voix, les catégories et les réponses types sont dans les documents ci-dessous : suis-les.

Règles qui priment sur tout :
- Tu n'inventes jamais un fait (prix, garantie, financement, délai, disponibilité). Une information absente ou marquée « [À REMPLIR » ne s'utilise pas.
- Seuls les liens des réglages peuvent être envoyés.
- Si l'expéditeur a laissé un numéro de téléphone, l'équipe est déjà prévenue et va le rappeler : dis-le simplement, sans promettre d'heure précise.
- Réclamation, remboursement, annulation, problème d'accès d'un client : action "forward_support".
- Newsletter, publicité, notification automatique : action "ignore".
- Partenariat, presse, demande inhabituelle, doute : action "escalate".`;

export async function alertSetting(emailId: string | null, phones: string[], name: string, context: string) {
  for (const phone of phones) {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: dup } = await db().from("setting_alerts").select("id").eq("phone", phone).gte("created_at", since).limit(1);
    if (dup?.length) continue;
    const { data: alert } = await db()
      .from("setting_alerts")
      .insert({ email_id: emailId, phone, name, context: context.slice(0, 1000) })
      .select()
      .single();
    if (!alert) continue;
    const sent = await tg.sendMessage(
      tg.settingChat() || tg.validationChat(),
      `📞 <b>Numéro à rappeler maintenant</b>\n<b>${tg.esc(name || "Contact")}</b> · ${tg.esc(prettyPhone(phone))}\n\n${tg.esc(context.slice(0, 600))}`,
      [[{ text: "✋ Je prends", callback_data: `s:claim:${alert.id}` }, { text: "✅ Appelé", callback_data: `s:done:${alert.id}` }]],
    );
    if (sent) await db().from("setting_alerts").update({ tg_message_id: sent.message_id }).eq("id", alert.id);
  }
}

async function handle(m: IncomingMail, mode: "supervised" | "auto") {
  const { data: row, error } = await db()
    .from("emails")
    .insert({
      mailbox: "mail",
      message_id: m.messageId,
      uid: m.uid,
      from_email: m.fromEmail,
      from_name: m.fromName,
      subject: m.subject,
      body: m.text,
      received_at: m.date.toISOString(),
      status: m.automated ? "ignored" : "new",
    })
    .select()
    .single();
  if (error || !row) return; // déjà vu (doublon) ou erreur d'écriture
  if (m.automated || m.fromEmail === mailboxAddress("mail").toLowerCase()) return;

  // Numéros → équipe setting, tout de suite, avant même la réponse.
  const phones = extractPhones(`${m.subject}\n${m.text.slice(0, 8000)}`);
  if (phones.length) {
    await db().from("emails").update({ phones }).eq("id", row.id);
    await alertSetting(row.id, phones, m.fromName || m.fromEmail, `✉️ ${m.subject}\n${m.text.slice(0, 500)}`);
  }

  const brain = await getBrain("mail");
  const history = await threadContext("mail", m.fromEmail, row.id);
  let d: z.infer<typeof Decision>;
  const input = [
    `Expéditeur : ${m.fromName} <${m.fromEmail}>`,
    `Objet : ${m.subject}`,
    `Reçu le : ${m.date.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`,
    phones.length ? `Numéro(s) détecté(s) et déjà transmis à l'équipe : ${phones.map(prettyPhone).join(", ")}` : "Aucun numéro de téléphone détecté.",
    history ? `\nÉchanges précédents avec cette personne :\n${history}` : "",
    `\nMail reçu :\n${m.text}`,
  ].join("\n");
  const allowedUrls = [configValue<string>(brain, "bookingLink", "")];
  try {
    d = await decide({ system: `${RULES}\n\n${brainAsPrompt(brain)}`, input, schema: Decision, effort: "medium" });
    let problems = d.action === "reply" ? checkOutgoing(d.message, { allowedUrls, channel: "email" }) : [];
    if (problems.length) {
      d = await decide({ system: `${RULES}\n\n${brainAsPrompt(brain)}`, input: `${input}\n\nATTENTION, ta proposition précédente a été bloquée : ${problems.join(" ; ")}. Corrige.`, schema: Decision, effort: "medium" });
      problems = d.action === "reply" ? checkOutgoing(d.message, { allowedUrls, channel: "email" }) : [];
    }
    await db().from("emails").update({ category: d.category, from_name: m.fromName || d.name }).eq("id", row.id);

    if (d.action === "ignore") {
      await db().from("emails").update({ status: "ignored" }).eq("id", row.id);
    } else if (d.action === "forward_support") {
      const to = mailboxAddress("support");
      if (to && mailboxReady("support")) {
        await sendMail("mail", {
          to,
          subject: `Fwd: ${m.subject}`,
          text: `Transféré automatiquement par l'agent mail.\nDe : ${m.fromName} <${m.fromEmail}>\nDate : ${m.date.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}\n\n${m.text}`,
        });
        await db().from("emails").update({ status: "forwarded" }).eq("id", row.id);
      } else {
        await db().from("emails").update({ status: "escalated" }).eq("id", row.id);
        await tg.alertLuc(`✉️ 🛟 <b>Demande support</b> de ${tg.esc(m.fromName || m.fromEmail)} (boîte support non configurée)\n${tg.esc(d.summary)}`);
      }
    } else if (d.action === "escalate") {
      await db().from("emails").update({ status: "escalated" }).eq("id", row.id);
      await tg.alertLuc(`✉️ 🙋 <b>Mail pour toi</b> : ${tg.esc(m.fromName || m.fromEmail)} — ${tg.esc(m.subject)}\n${tg.esc(d.reason)}\n\n${tg.esc(d.summary)}`);
    } else {
      const canAuto = mode === "auto" && problems.length === 0;
      const draft = await createDraft({
        channel: "mail",
        refId: row.id,
        content: d.message,
        meta: { reason: problems.length ? `⚠️ ${problems.join(" ; ")}` : d.reason },
        header: `<b>${tg.esc(m.fromName || m.fromEmail)}</b> — ${tg.esc(m.subject)}\n<i>${tg.esc(d.summary)}</i>`,
        notify: !canAuto,
      });
      await db().from("emails").update({ status: "drafted" }).eq("id", row.id);
      if (canAuto) await sendDraft(draft.id, "auto");
    }
  } catch (e) {
    await db().from("emails").update({ status: "error" }).eq("id", row.id);
    await logEvent("mail", `${m.fromEmail} : ${claudeErrorLabel(e)}`, "error");
  }
}

export async function runMail(): Promise<string> {
  const modes = await getModes();
  if (modes.mail === "off") return "mail : coupé";
  if (!mailboxReady("mail")) return "mail : boîte non configurée";
  const mails = await fetchNew("mail");
  for (const m of mails) await handle(m, modes.mail);
  return `mail : ${mails.length} nouveau(x) message(s)`;
}

/** 🔁 Autre version pour un brouillon mail. */
export async function redoMail(emailId: string, hint?: string) {
  const { data: e } = await db().from("emails").select("*").eq("id", emailId).single();
  if (!e) return;
  const brain = await getBrain("mail");
  const history = await threadContext("mail", e.from_email, e.id);
  const d = await decide({
    system: `${RULES}\n\n${brainAsPrompt(brain)}`,
    input: `Expéditeur : ${e.from_name} <${e.from_email}>\nObjet : ${e.subject}\n${history ? `\nÉchanges précédents :\n${history}\n` : ""}\nMail reçu :\n${e.body}\n\nÉcris une AUTRE version de la réponse (action "reply").${hint ? ` Consigne de Luc : ${hint}` : ""}`,
    schema: Decision,
    effort: "medium",
  });
  await createDraft({
    channel: "mail",
    refId: e.id,
    content: d.message,
    meta: { reason: d.reason },
    header: `<b>${tg.esc(e.from_name || e.from_email)}</b> — ${tg.esc(e.subject)} · nouvelle version`,
    notify: true,
  });
}
