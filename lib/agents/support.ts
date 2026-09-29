import { z } from "zod";
import { db, logEvent } from "../db";
import { getBrain, brainAsPrompt } from "../brains";
import { decide, claudeErrorLabel } from "../claude";
import { checkOutgoing } from "../guardrails";
import { createDraft, sendDraft } from "../drafts";
import { getModes } from "../settings";
import { fetchNew, mailboxReady, mailboxAddress, threadContext, type IncomingMail } from "../mail";
import * as tg from "../telegram";

/**
 * Agent SUPPORT : réclamations, remboursements, annulations, problèmes d'accès.
 * Suit le script du cerveau « support ». Ne décide JAMAIS seul d'un remboursement :
 * il rassemble les informations, accuse réception et demande la décision à Luc sur Telegram.
 */

const Decision = z.object({
  category: z.string().describe("L'id de catégorie du cerveau support"),
  info: z.array(z.object({ key: z.string(), value: z.string() })).describe("Informations obtenues (nom, email_achat, date_achat, formule, motif…)"),
  missing: z.array(z.string()).describe("Informations requises encore manquantes"),
  action: z.enum(["reply", "await_decision", "escalate_urgent", "ignore"]),
  message: z.string().describe("Le mail à envoyer au client (accusé de réception, demande d'infos, réponse). Vide si ignore."),
  reason: z.string().describe("Une phrase pour Luc"),
  summary: z.string().describe("Le dossier en 2 phrases : qui, quoi, depuis quand, ce qui est demandé"),
});
type Decision = z.infer<typeof Decision>;

const RULES = `Tu es l'agent support de Labarile English. Tu traites les réclamations, demandes de remboursement, annulations et problèmes techniques reçus par mail, en suivant le script ci-dessous à la lettre, en français.

Règles qui priment sur tout :
- Tu n'accordes ni ne refuses JAMAIS toi-même un remboursement, un avoir ou une annulation, et tu ne promets aucune somme. Dès qu'une décision est nécessaire et que les informations requises sont réunies : action "await_decision" (ton message = accusé de réception qui explique la suite et le délai).
- S'il manque des informations requises : action "reply" pour les demander, poliment, toutes en une fois.
- Menace juridique, avocat, opposition bancaire, avis public négatif, détresse, santé : action "escalate_urgent" (ton message = accusé de réception bref et empathique).
- Tu n'inventes aucune règle : si la politique contient « [À REMPLIR », tu ne cites pas de délai ni de condition, tu dis que l'équipe revient vers la personne.
- Pas de lien, sauf ceux présents dans le cerveau.`;

async function ticketFor(m: IncomingMail) {
  const { data: open } = await db()
    .from("support_tickets")
    .select("*")
    .eq("email", m.fromEmail)
    .neq("status", "resolu")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) return open;
  const { data } = await db().from("support_tickets").insert({ email: m.fromEmail, name: m.fromName }).select().single();
  return data;
}

function decisionKeyboard(ticketId: string): tg.Keyboard {
  return [[
    { text: "✅ Accorder", callback_data: `t:yes:${ticketId}` },
    { text: "❌ Refuser", callback_data: `t:no:${ticketId}` },
  ]];
}

async function handle(m: IncomingMail, mode: "supervised" | "auto") {
  const ticket = await ticketFor(m);
  if (!ticket) return;
  const { data: row, error } = await db()
    .from("emails")
    .insert({
      mailbox: "support",
      message_id: m.messageId,
      uid: m.uid,
      from_email: m.fromEmail,
      from_name: m.fromName,
      subject: m.subject,
      body: m.text,
      received_at: m.date.toISOString(),
      status: m.automated ? "ignored" : "new",
      ticket_id: ticket.id,
    })
    .select()
    .single();
  if (error || !row) return;
  if (m.automated || m.fromEmail === mailboxAddress("support").toLowerCase()) return;

  const brain = await getBrain("support");
  const history = await threadContext("support", m.fromEmail, row.id);
  const input = [
    `Dossier : ${ticket.id.slice(0, 8)} · statut ${ticket.status} · catégorie ${ticket.category ?? "?"}`,
    `Informations déjà connues : ${JSON.stringify(ticket.info)}`,
    ticket.decision ? `Décision déjà prise par l'équipe : ${ticket.decision}` : "",
    `Expéditeur : ${m.fromName} <${m.fromEmail}>`,
    `Objet : ${m.subject}`,
    history ? `\nÉchanges précédents :\n${history}` : "",
    `\nMail reçu :\n${m.text}`,
  ].join("\n");

  let d: Decision;
  try {
    d = await decide({ system: `${RULES}\n\n${brainAsPrompt(brain)}`, input, schema: Decision, effort: "high" });
  } catch (e) {
    await db().from("emails").update({ status: "error" }).eq("id", row.id);
    await logEvent("support", `${m.fromEmail} : ${claudeErrorLabel(e)}`, "error");
    await tg.alertLuc(`🛟 ⚠️ Mail support non traité (${tg.esc(m.fromEmail)}) : ${tg.esc(claudeErrorLabel(e))}`);
    return;
  }

  const info = { ...ticket.info, ...Object.fromEntries(d.info.map((i) => [i.key, i.value])) };
  const status = d.action === "await_decision" || d.action === "escalate_urgent" ? "attente_decision" : d.action === "reply" && d.missing.length ? "attente_client" : ticket.status;
  await db()
    .from("support_tickets")
    .update({ category: d.category, info, summary: d.summary, status, name: ticket.name || m.fromName, updated_at: new Date().toISOString() })
    .eq("id", ticket.id);
  await db().from("emails").update({ category: d.category }).eq("id", row.id);

  if (d.action === "ignore") {
    await db().from("emails").update({ status: "ignored" }).eq("id", row.id);
    return;
  }

  if (d.action === "await_decision" || d.action === "escalate_urgent") {
    const urgent = d.action === "escalate_urgent";
    await tg.sendMessage(
      tg.validationChat(),
      `🛟 ${urgent ? "🚨 <b>URGENT</b> · " : ""}<b>Décision à prendre</b> · ${tg.esc(d.category)}\n<b>${tg.esc(m.fromName || m.fromEmail)}</b>\n\n${tg.esc(d.summary)}\n\n<i>Infos :</i> ${tg.esc(JSON.stringify(info))}`,
      decisionKeyboard(ticket.id),
    );
  }

  if (!d.message.trim()) return;
  const problems = checkOutgoing(d.message, { channel: "email", allowedUrls: [] });
  // En automatique, seules les demandes d'informations et réponses simples partent seules.
  const canAuto = mode === "auto" && d.action === "reply" && problems.length === 0;
  const draft = await createDraft({
    channel: "support",
    refId: row.id,
    content: d.message,
    meta: { reason: problems.length ? `⚠️ ${problems.join(" ; ")}` : d.reason, ticketId: ticket.id },
    header: `<b>${tg.esc(m.fromName || m.fromEmail)}</b> — ${tg.esc(m.subject)}\n<i>${tg.esc(d.summary)}</i>`,
    notify: !canAuto,
  });
  await db().from("emails").update({ status: "drafted" }).eq("id", row.id);
  if (canAuto) await sendDraft(draft.id, "auto");
}

export async function runSupport(): Promise<string> {
  const modes = await getModes();
  if (modes.support === "off") return "support : coupé";
  if (!mailboxReady("support")) return "support : boîte non configurée";
  const mails = await fetchNew("support");
  for (const m of mails) await handle(m, modes.support);
  return `support : ${mails.length} nouveau(x) message(s)`;
}

/** Luc a tranché (bouton Accorder / Refuser) → l'agent rédige le mail de décision, toujours à valider. */
export async function applyDecision(ticketId: string, decision: "accorde" | "refuse", by: string) {
  const { data: ticket } = await db().from("support_tickets").select("*").eq("id", ticketId).single();
  if (!ticket) return;
  await db().from("support_tickets").update({ decision, status: "resolu", updated_at: new Date().toISOString() }).eq("id", ticketId);
  const { data: lastIn } = await db()
    .from("emails")
    .select("*")
    .eq("ticket_id", ticketId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!lastIn) return;
  const brain = await getBrain("support");
  const history = await threadContext("support", ticket.email, lastIn.id);
  const d = await decide({
    system: `${RULES}\n\n${brainAsPrompt(brain)}`,
    input: `Dossier ${ticket.id.slice(0, 8)} · ${ticket.category}\nInfos : ${JSON.stringify(ticket.info)}\n${history ? `Échanges :\n${history}\n` : ""}\nDernier mail du client :\n${lastIn.body}\n\nDÉCISION DE L'ÉQUIPE (prise par ${by}) : ${decision === "accorde" ? "ACCORDÉE" : "REFUSÉE"}.\nÉcris le mail qui annonce cette décision au client selon les réponses types (action "reply"). ${decision === "refuse" ? "Explique avec tact et propose l'alternative prévue par la politique si elle existe." : "Explique les prochaines étapes sans inventer de délai absent de la politique."}`,
    schema: Decision,
    effort: "high",
  });
  await createDraft({
    channel: "support",
    refId: lastIn.id,
    content: d.message,
    meta: { reason: `Décision : ${decision === "accorde" ? "accordée" : "refusée"} par ${by}`, ticketId },
    header: `<b>${tg.esc(ticket.name || ticket.email)}</b> — mail de décision`,
    notify: true,
  });
  await logEvent("support", `Dossier ${ticket.email} : ${decision} par ${by}`);
}

export async function redoSupport(emailId: string, hint?: string) {
  const { data: e } = await db().from("emails").select("*").eq("id", emailId).single();
  if (!e) return;
  const { data: ticket } = await db().from("support_tickets").select("*").eq("id", e.ticket_id).maybeSingle();
  const brain = await getBrain("support");
  const history = await threadContext("support", e.from_email, e.id);
  const d = await decide({
    system: `${RULES}\n\n${brainAsPrompt(brain)}`,
    input: `Dossier : ${JSON.stringify(ticket?.info ?? {})}${ticket?.decision ? ` · décision : ${ticket.decision}` : ""}\n${history ? `Échanges :\n${history}\n` : ""}\nMail du client :\n${e.body}\n\nÉcris une AUTRE version du mail à envoyer (action "reply").${hint ? ` Consigne de Luc : ${hint}` : ""}`,
    schema: Decision,
    effort: "high",
  });
  await createDraft({
    channel: "support",
    refId: e.id,
    content: d.message,
    meta: { reason: d.reason, ticketId: e.ticket_id },
    header: `<b>${tg.esc(e.from_name || e.from_email)}</b> — nouvelle version`,
    notify: true,
  });
}
