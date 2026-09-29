import { NextResponse, after, type NextRequest } from "next/server";
import { db, logEvent, type Agent } from "@/lib/db";
import * as tg from "@/lib/telegram";
import { sendDraft, rejectDraft, updateDraftContent, markDoneManually, draftCard, draftKeyboard, type Draft } from "@/lib/drafts";
import { redoInsta } from "@/lib/agents/insta";
import { redoMail } from "@/lib/agents/mail";
import { redoSupport, applyDecision } from "@/lib/agents/support";
import { redoStory } from "@/lib/agents/stories";
import { getModes, setSetting, parisTime, type Mode } from "@/lib/settings";
import { getBrain, missingPlaceholders } from "@/lib/brains";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type TgUser = { id: number; first_name?: string; username?: string };
type TgMessage = { message_id: number; chat: { id: number }; from?: TgUser; text?: string; reply_to_message?: { message_id: number } };
type Update = {
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; data?: string; message?: TgMessage };
};

const who = (u?: TgUser) => (u?.username ? `@${u.username}` : u?.first_name ?? "quelqu'un");

function allowedChat(chatId: number): boolean {
  const id = String(chatId);
  return id === tg.validationChat() || (tg.settingChat() !== "" && id === tg.settingChat());
}

async function onCallback(q: NonNullable<Update["callback_query"]>) {
  const chatId = q.message?.chat.id;
  if (!chatId || !allowedChat(chatId)) return tg.answerCallback(q.id, "Groupe non autorisé.");
  const [kind, action, id] = (q.data ?? "").split(":");
  const by = who(q.from);

  // ── Brouillons (DM / mails) ──
  if (kind === "d") {
    const { data } = await db().from("drafts").select("*").eq("id", id).maybeSingle();
    const d = data as Draft | null;
    if (!d || d.status !== "pending") return tg.answerCallback(q.id, "Déjà traité.");
    if (action === "send") {
      await tg.answerCallback(q.id, "Envoi…");
      const r = await sendDraft(id, by);
      if (!r.ok) await tg.alertLuc(`❌ Échec : ${tg.esc(r.error)}`);
    } else if (action === "done") {
      await markDoneManually(id, by);
      await tg.answerCallback(q.id, "Noté ✅");
    } else if (action === "drop") {
      await rejectDraft(id, d.channel === "insta" ? `Repris par ${by}` : `Ignoré par ${by}`);
      if (d.channel === "insta") await db().from("ig_conversations").update({ status: "human" }).eq("id", d.ref_id);
      await tg.answerCallback(q.id, "OK");
    } else if (action === "edit") {
      const prompt = await tg.sendMessage(tg.validationChat(), `✏️ Réponds à <b>ce message</b> avec le texte exact à envoyer (il remplacera la proposition).`, undefined, {
        reply_markup: { force_reply: true, selective: true },
      });
      if (prompt) await db().from("tg_edits").insert({ prompt_message_id: prompt.message_id, draft_id: id });
      await tg.answerCallback(q.id);
    } else if (action === "redo") {
      await tg.answerCallback(q.id, "Je réécris…");
      after(async () => {
        try {
          if (d.channel === "insta") await redoInsta(d.ref_id);
          else if (d.channel === "mail") await redoMail(d.ref_id);
          else await redoSupport(d.ref_id);
        } catch (e) {
          await tg.alertLuc(`❌ Nouvelle version impossible : ${tg.esc(e instanceof Error ? e.message : String(e))}`);
        }
      });
    }
    return;
  }

  // ── Alertes setting (numéros à rappeler) ──
  if (kind === "s") {
    const { data: a } = await db().from("setting_alerts").select("*").eq("id", id).maybeSingle();
    if (!a || !q.message) return tg.answerCallback(q.id, "Introuvable.");
    const base = `📞 <b>${tg.esc(a.name || "Contact")}</b> · ${tg.esc(a.phone)}\n\n${tg.esc((a.context ?? "").slice(0, 600))}`;
    if (action === "claim") {
      if (a.claimed_by && a.claimed_by !== by) return tg.answerCallback(q.id, `Déjà pris par ${a.claimed_by}`);
      await db().from("setting_alerts").update({ claimed_by: by, claimed_at: new Date().toISOString() }).eq("id", id);
      await tg.editMessage(String(chatId), q.message.message_id, `${base}\n\n✋ <b>Pris par ${tg.esc(by)}</b> à ${parisTime()}`, [
        [{ text: "✅ Appelé", callback_data: `s:done:${id}` }],
      ]);
      return tg.answerCallback(q.id, "C'est à toi 👍");
    }
    if (action === "done") {
      await db().from("setting_alerts").update({ done_at: new Date().toISOString(), claimed_by: a.claimed_by ?? by }).eq("id", id);
      await tg.editMessage(String(chatId), q.message.message_id, `${base}\n\n✅ <b>Appelé par ${tg.esc(a.claimed_by ?? by)}</b> à ${parisTime()}`);
      return tg.answerCallback(q.id, "Merci ✅");
    }
  }

  // ── Décisions support ──
  if (kind === "t" && (action === "yes" || action === "no")) {
    const { data: t } = await db().from("support_tickets").select("decision,name,email").eq("id", id).maybeSingle();
    if (!t) return tg.answerCallback(q.id, "Dossier introuvable.");
    if (t.decision) return tg.answerCallback(q.id, `Déjà décidé : ${t.decision}`);
    const decision = action === "yes" ? "accorde" : "refuse";
    if (q.message) {
      await tg.editMessage(String(chatId), q.message.message_id, `🛟 <b>${tg.esc(t.name || t.email)}</b> : ${decision === "accorde" ? "✅ accordé" : "❌ refusé"} par ${tg.esc(by)}.\nJe rédige le mail de réponse…`);
    }
    await tg.answerCallback(q.id, "Noté");
    after(async () => {
      try {
        await applyDecision(id, decision, by);
      } catch (e) {
        await tg.alertLuc(`❌ Mail de décision impossible : ${tg.esc(e instanceof Error ? e.message : String(e))}`);
      }
    });
    return;
  }

  // ── Stories ──
  if (kind === "st") {
    const { data: s } = await db().from("stories").select("*").eq("id", id).maybeSingle();
    if (!s || !q.message) return tg.answerCallback(q.id, "Introuvable.");
    if (!["draft", "approved"].includes(s.status)) return tg.answerCallback(q.id, "Déjà traitée.");
    const when = s.scheduled_for ? parisTime(new Date(s.scheduled_for)) : "";
    if (action === "ok") {
      await db().from("stories").update({ status: "approved" }).eq("id", id);
      await tg.editCaption(String(chatId), q.message.message_id, `✅ <b>Programmée</b> à ${when} par ${tg.esc(by)}`);
      return tg.answerCallback(q.id, "Programmée ✅");
    }
    if (action === "no") {
      await db().from("stories").update({ status: "rejected" }).eq("id", id);
      await tg.editCaption(String(chatId), q.message.message_id, `❌ Supprimée par ${tg.esc(by)}`);
      return tg.answerCallback(q.id, "Supprimée");
    }
    if (action === "redo") {
      await tg.editCaption(String(chatId), q.message.message_id, `🔁 Nouvelle version demandée par ${tg.esc(by)}…`);
      await tg.answerCallback(q.id, "Je réécris…");
      after(async () => {
        try {
          await redoStory(id);
        } catch (e) {
          await tg.alertLuc(`❌ Nouvelle story impossible : ${tg.esc(e instanceof Error ? e.message : String(e))}`);
        }
      });
      return;
    }
  }
  return tg.answerCallback(q.id);
}

const AGENT_NAMES: Record<string, Agent> = { insta: "insta", instagram: "insta", mail: "mail", mails: "mail", support: "support", stories: "stories", story: "stories" };

async function onMessage(m: TgMessage) {
  const chatId = String(m.chat.id);
  const text = (m.text ?? "").trim();

  // /id : fonctionne partout (sert à l'installation pour connaître l'id du groupe).
  if (/^\/id(@\w+)?$/.test(text)) {
    return tg.sendMessage(chatId, `L'identifiant de ce groupe est : <code>${chatId}</code>`);
  }
  if (!allowedChat(m.chat.id)) return;

  // Réponse à un « ✏️ Modifier »
  if (m.reply_to_message && text) {
    const { data: edit } = await db().from("tg_edits").select("*").eq("prompt_message_id", m.reply_to_message.message_id).maybeSingle();
    if (edit) {
      const d = await updateDraftContent(edit.draft_id, text);
      await db().from("tg_edits").delete().eq("prompt_message_id", edit.prompt_message_id);
      if (!d) return tg.sendMessage(chatId, "Ce brouillon a déjà été traité.");
      const card = await tg.sendMessage(tg.validationChat(), draftCard(d, "version modifiée par " + who(m.from)), draftKeyboard(d));
      if (d.tg_message_id) await tg.editMessage(tg.validationChat(), d.tg_message_id, "<i>Modifié : voir la nouvelle carte ci-dessous.</i>");
      if (card) await db().from("drafts").update({ tg_message_id: card.message_id }).eq("id", d.id);
      return;
    }
  }

  // /mode <agent> <off|supervise|auto>
  const mode = text.match(/^\/mode(?:@\w+)?\s+(\w+)\s+(off|coupe|supervise|supervisé|auto)$/i);
  if (mode) {
    const agent = AGENT_NAMES[mode[1].toLowerCase()];
    if (!agent) return tg.sendMessage(chatId, "Agent inconnu : insta, mail, support ou stories.");
    const value: Mode = /^(off|coupe)$/i.test(mode[2]) ? "off" : /^auto$/i.test(mode[2]) ? "auto" : "supervised";
    if (value === "auto") {
      const missing = missingPlaceholders(await getBrain(agent));
      if (missing.length) return tg.sendMessage(chatId, `⛔ Impossible de passer ${agent} en automatique : il reste ${missing.length} « [À REMPLIR] » dans son cerveau.`);
    }
    const modes = await getModes();
    await setSetting("modes", { ...modes, [agent]: value });
    await logEvent("system", `${who(m.from)} : ${agent} → ${value}`);
    return tg.sendMessage(chatId, `✅ ${agent} : ${value === "off" ? "coupé" : value === "auto" ? "automatique" : "supervisé"}`);
  }

  if (/^\/statut(@\w+)?$/.test(text)) {
    const modes = await getModes();
    const [{ count: drafts }, { count: calls }, { count: tickets }] = await Promise.all([
      db().from("drafts").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db().from("setting_alerts").select("id", { count: "exact", head: true }).is("done_at", null),
      db().from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "attente_decision"),
    ]);
    const label = (v: Mode) => (v === "off" ? "⏸ coupé" : v === "auto" ? "🤖 auto" : "👀 supervisé");
    return tg.sendMessage(
      chatId,
      `<b>Labarile Agents</b>\n📸 Insta : ${label(modes.insta)}\n✉️ Mail : ${label(modes.mail)}\n🛟 Support : ${label(modes.support)}\n🎨 Stories : ${label(modes.stories)}\n\n📝 Brouillons en attente : ${drafts ?? 0}\n📞 Rappels à faire : ${calls ?? 0}\n⚖️ Décisions support : ${tickets ?? 0}`,
    );
  }

  if (/^\/(aide|help|start)(@\w+)?$/.test(text)) {
    return tg.sendMessage(
      chatId,
      "<b>Commandes</b>\n/statut : état des agents\n/mode insta auto · /mode mail supervise · /mode support off …\n/id : identifiant du groupe",
    );
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== (await tg.webhookSecret())) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  const update = (await request.json()) as Update;
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (e) {
    await logEvent("system", `Telegram : ${e instanceof Error ? e.message : String(e)}`, "error");
  }
  return NextResponse.json({ ok: true });
}
