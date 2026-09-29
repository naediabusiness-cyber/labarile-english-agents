import { db, logEvent } from "./db";
import * as tg from "./telegram";
import * as pk from "./plugkit";
import { sendMail, replySubject, type Mailbox } from "./mail";
import { bookCall, type Booking } from "./iclosed";

/**
 * Un brouillon = un message prêt à partir, qui attend (mode supervisé) ou non (mode auto).
 * channel insta : ref_id = conversation IG ; channel mail/support : ref_id = id de l'email d'origine.
 */

export type Draft = {
  id: string;
  channel: "insta" | "mail" | "support";
  ref_id: string;
  content: string;
  meta: Record<string, unknown>;
  status: string;
  tg_message_id: number | null;
};

const LABEL: Record<Draft["channel"], string> = { insta: "📸 Instagram", mail: "✉️ Mail", support: "🛟 Support" };

export function draftKeyboard(d: Pick<Draft, "id" | "channel" | "meta">): tg.Keyboard {
  if (d.meta?.phoneOnly) {
    return [
      [{ text: "📱 Envoyé depuis le téléphone", callback_data: `d:done:${d.id}` }],
      [
        { text: "✏️ Modifier", callback_data: `d:edit:${d.id}` },
        { text: "🔁 Autre version", callback_data: `d:redo:${d.id}` },
        { text: "🗑 Ignorer", callback_data: `d:drop:${d.id}` },
      ],
    ];
  }
  return [
    [
      { text: "✅ Envoyer", callback_data: `d:send:${d.id}` },
      { text: "✏️ Modifier", callback_data: `d:edit:${d.id}` },
    ],
    [
      { text: "🔁 Autre version", callback_data: `d:redo:${d.id}` },
      { text: d.channel === "insta" ? "🙋 Je reprends" : "🗑 Ignorer", callback_data: `d:drop:${d.id}` },
    ],
  ];
}

export function draftCard(d: Pick<Draft, "channel" | "content" | "meta">, header: string): string {
  const why = d.meta.reason ? `\n<i>${tg.esc(String(d.meta.reason))}</i>` : "";
  return `<b>${LABEL[d.channel]}</b> · ${header}${why}\n\n<b>Proposition :</b>\n${tg.esc(d.content)}`;
}

/** Crée un brouillon (remplace un éventuel brouillon en attente sur la même conversation). */
export async function createDraft(input: {
  channel: Draft["channel"];
  refId: string;
  content: string;
  meta?: Record<string, unknown>;
  header: string;
  notify: boolean;
}): Promise<Draft> {
  const old = await db().from("drafts").select("id,tg_message_id").eq("channel", input.channel).eq("ref_id", input.refId).eq("status", "pending");
  for (const o of old.data ?? []) {
    await db().from("drafts").update({ status: "superseded" }).eq("id", o.id);
    if (o.tg_message_id) await tg.editMessage(tg.validationChat(), o.tg_message_id, "<i>Remplacé par une version plus récente.</i>");
  }
  const { data, error } = await db()
    .from("drafts")
    .insert({ channel: input.channel, ref_id: input.refId, content: input.content, meta: input.meta ?? {} })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "brouillon non créé");
  const draft = data as Draft;
  if (input.notify) {
    const sent = await tg.sendMessage(tg.validationChat(), draftCard(draft, input.header), draftKeyboard(draft));
    if (sent) {
      await db().from("drafts").update({ tg_message_id: sent.message_id }).eq("id", draft.id);
      draft.tg_message_id = sent.message_id;
    }
  }
  return draft;
}

/** Envoie réellement le brouillon (DM ou email). Irréversible. */
export async function sendDraft(id: string, by = "auto"): Promise<{ ok: boolean; error?: string }> {
  // Verrou : on ne passe à « sending » que depuis « pending » (évite le double envoi sur double clic).
  const { data: locked } = await db().from("drafts").update({ status: "sending" }).eq("id", id).eq("status", "pending").select().maybeSingle();
  if (!locked) return { ok: false, error: "déjà traité" };
  const d = locked as Draft;
  try {
    if (d.channel === "insta") {
      // Réservation iClosed d'abord : si le créneau n'est plus libre, le message de confirmation ne part pas.
      const booking = d.meta.booking as (Booking & { label: string; bookingLink: string }) | undefined;
      if (booking) {
        let booked: Awaited<ReturnType<typeof bookCall>>;
        try {
          booked = await bookCall(booking.bookingLink, booking);
        } catch (e) {
          await db().from("ig_conversations").update({ status: "human" }).eq("id", d.ref_id);
          await tg.alertLuc(
            `⚠️ <b>Réservation iClosed impossible</b> (${tg.esc(booking.label)}) pour ${tg.esc(booking.firstName)} ${tg.esc(booking.lastName)} : ${tg.esc(e instanceof Error ? e.message : String(e))}\nLe message n'est pas parti. Conversation passée en « je reprends ».`,
          );
          throw new Error(`réservation iClosed refusée (${e instanceof Error ? e.message : e})`);
        }
        const { data: conv } = await db().from("ig_conversations").select("name,fields").eq("id", d.ref_id).single();
        const fields = { ...(conv?.fields ?? {}), rdv: `${booking.label} (${booking.timeZone})`, email: booking.email, ...(booked.closerName ? { closer: booked.closerName } : {}) };
        await db().from("ig_conversations").update({ stage: "rdv_confirme", fields }).eq("id", d.ref_id);
        await tg.alertLuc(
          `📅 <b>Appel réservé dans iClosed</b> : ${tg.esc(booking.firstName)} ${tg.esc(booking.lastName)} (${tg.esc(conv?.name ?? "")})\n${tg.esc(booking.label)} · ${tg.esc(booking.timeZone)}${booked.closerName ? ` · closer : ${tg.esc(booked.closerName)}` : ""}`,
        );
      }
      const msgId = await pk.sendMessage(d.ref_id, d.content, `draft-${d.id}`);
      const now = new Date().toISOString();
      await db()
        .from("ig_messages")
        .upsert({ id: msgId || `local-${d.id}`, conversation_id: d.ref_id, direction: "outgoing", text: d.content, created_at: now });
      const patch: Record<string, unknown> = { last_outbound_at: now, updated_at: now };
      if (d.meta.followUp) {
        const { data: conv } = await db().from("ig_conversations").select("follow_ups").eq("id", d.ref_id).single();
        patch.follow_ups = (conv?.follow_ups ?? 0) + 1;
      }
      await db().from("ig_conversations").update(patch).eq("id", d.ref_id);
    } else {
      const box: Mailbox = d.channel;
      const { data: orig } = await db().from("emails").select("*").eq("id", d.ref_id).single();
      if (!orig) throw new Error("email d'origine introuvable");
      const subject = replySubject(orig.subject ?? "");
      const messageId = await sendMail(box, { to: orig.from_email, subject, text: d.content, inReplyTo: orig.message_id ?? undefined });
      await db().from("emails").insert({
        mailbox: box,
        message_id: messageId,
        from_email: orig.from_email,
        from_name: orig.from_name,
        subject,
        body: d.content,
        received_at: new Date().toISOString(),
        direction: "out",
        status: "replied",
        ticket_id: orig.ticket_id,
      });
      await db().from("emails").update({ status: "replied" }).eq("id", orig.id);
    }
    await db().from("drafts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", d.id);
    if (d.tg_message_id) {
      await tg.editMessage(tg.validationChat(), d.tg_message_id, `✅ <b>Envoyé</b> (${tg.esc(by)})\n\n${tg.esc(d.content)}`);
    }
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db().from("drafts").update({ status: "failed", error }).eq("id", d.id);
    await logEvent(d.channel, `Échec d'envoi : ${error}`, "error");
    if (d.tg_message_id) await tg.editMessage(tg.validationChat(), d.tg_message_id, `❌ <b>Échec d'envoi</b> : ${tg.esc(error)}\n\n${tg.esc(d.content)}`);
    return { ok: false, error };
  }
}

/** Luc a envoyé le message lui-même (hors fenêtre 24 h) : on le note comme envoyé. */
export async function markDoneManually(id: string, by: string) {
  const { data } = await db().from("drafts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select().maybeSingle();
  if (!data) return;
  if (data.channel === "insta") {
    const patch: Record<string, unknown> = { last_outbound_at: new Date().toISOString() };
    if (data.meta?.followUp) {
      const { data: conv } = await db().from("ig_conversations").select("follow_ups").eq("id", data.ref_id).single();
      patch.follow_ups = (conv?.follow_ups ?? 0) + 1;
    }
    await db().from("ig_conversations").update(patch).eq("id", data.ref_id);
  }
  if (data.tg_message_id) await tg.editMessage(tg.validationChat(), data.tg_message_id, `📱 <b>Envoyé depuis le téléphone</b> (${tg.esc(by)})\n\n${tg.esc(data.content)}`);
}

export async function rejectDraft(id: string, note = "Ignoré") {
  const { data } = await db().from("drafts").update({ status: "rejected" }).eq("id", id).eq("status", "pending").select().maybeSingle();
  if (data?.tg_message_id) await tg.editMessage(tg.validationChat(), data.tg_message_id, `🗑 <b>${tg.esc(note)}</b>\n\n${tg.esc(data.content)}`);
  return data as Draft | null;
}

export async function updateDraftContent(id: string, content: string) {
  const { data } = await db().from("drafts").update({ content }).eq("id", id).eq("status", "pending").select().maybeSingle();
  return data as Draft | null;
}
