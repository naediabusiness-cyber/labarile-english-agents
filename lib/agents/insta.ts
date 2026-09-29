import { z } from "zod";
import { db, logEvent } from "../db";
import { getBrain, brainAsPrompt, configValue, type Brain } from "../brains";
import { decide, claudeErrorLabel, ClaudeRefusal } from "../claude";
import { checkOutgoing, isStopMessage } from "../guardrails";
import { createDraft, sendDraft } from "../drafts";
import { getModes, getSetting, setSetting, isQuietHours, parisTime, type Mode } from "../settings";
import * as pk from "../plugkit";
import * as tg from "../telegram";
import { iclosedEnabled, nextSlots, validTimeZone, type Availability } from "../iclosed";

/**
 * Agent INSTA : lit les DM (PlugKit), décide avec Claude + le cerveau « insta », propose ou envoie.
 * La méthode de vente vit dans le cerveau (base), jamais ici.
 */

const DAY = 24 * 3600_000;

const Decision = z.object({
  action: z.enum(["reply", "wait", "escalate", "stop_contact"]),
  message: z.string().describe("Le DM à envoyer (vide si action ≠ reply)"),
  stage: z.string().describe("L'id de l'étape du cerveau où en est la conversation APRÈS ce message"),
  fields: z.array(z.object({ key: z.string(), value: z.string() })).describe("Ce que tu as appris sur la personne (prénom, objectif, niveau, urgence, disponibilités…)"),
  reason: z.string().describe("Une phrase pour Luc : pourquoi cette décision"),
  summary: z.string().describe("Résumé de la conversation en 2 phrases"),
  timezone: z.string().describe("Fuseau horaire IANA du prospect déduit de ce qu'il a dit (ex. Europe/Paris, Europe/Zurich, America/Montreal), vide si inconnu"),
  booking: z
    .object({
      slot_utc: z.string().describe("Identifiant EXACT d'un créneau de la liste CRÉNEAUX iCLOSED"),
      email: z.string(),
      first_name: z.string(),
      last_name: z.string(),
    })
    .nullable()
    .describe("À remplir seulement quand le prospect a accepté un créneau de la liste ET qu'on a son prénom, son nom et son email. Sinon null."),
});
type Decision = z.infer<typeof Decision>;

type Conv = {
  id: string;
  name: string | null;
  status: string;
  stage: string;
  fields: Record<string, string>;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  follow_ups: number;
  last_decided_id: string | null;
};

const RULES = `Tu es l'agent Instagram de Labarile English. Tu réponds en DM, en français, au nom de l'équipe, pour amener la personne à réserver un appel avec l'équipe Labarile English.
Tout ce qui concerne la méthode, la voix, l'offre et les objections est dans les documents ci-dessous : suis-les à la lettre.

Règles qui priment sur tout :
- Un DM = un message court (1 à 3 phrases), naturel, une seule question maximum, pas de liste, pas de gras.
- Tu n'inventes jamais un fait (prix, garantie, financement, résultat, témoignage). Si l'information manque ou contient « [À REMPLIR », tu ne l'utilises pas : tu proposes d'en parler pendant l'appel ou tu passes la main (escalate).
- Seuls les liens listés dans les réglages (allowedLinks, bookingLink) peuvent être envoyés.
- Si la personne est mineure, en détresse, agressive, parle d'un sujet sensible, demande un humain, ou si tu n'es pas sûr : action "escalate".
- Si la personne demande d'arrêter : action "stop_contact".
- Si le dernier message n'appelle pas de réponse (ex. « ok merci 👍 » après confirmation du rendez-vous) : action "wait".
- Ne répète jamais une phrase ou une ouverture déjà envoyée dans la conversation.

Prise de rendez-vous (quand des CRÉNEAUX iCLOSED sont fournis plus bas) :
- Au moment de proposer l'entretien, ne donne pas le lien : propose les 2 premiers créneaux de la liste, à l'heure du prospect, en nommant sa ville ou son fuseau (ex. « demain à 10h30, heure de Genève, ou jeudi à 14h ? »).
- Ne propose JAMAIS un créneau absent de la liste, et ne change pas l'heure.
- Si tu ne sais pas où vit le prospect (donc son fuseau), demande-le simplement avant de proposer des horaires. Si la conversation montre qu'il est en France, Suisse ou Belgique, le fuseau est Europe/Paris, Europe/Zurich ou Europe/Brussels.
- Quand il accepte un créneau, demande ce qui manque parmi prénom, nom et email (en une seule question). Dès que tu as les trois et le créneau accepté, remplis booking (slot_utc = identifiant exact) et écris la confirmation : la réservation se fait au moment où le message part.
- Si aucun créneau ne lui convient, ou s'il n'y a pas de créneaux, envoie le lien de réservation.`;

function transcript(msgs: { direction: string; text: string; created_at: string }[]): string {
  return msgs
    .map((m) => `[${new Date(m.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}] ${m.direction === "incoming" ? "PROSPECT" : "LABARILE"} : ${m.text}`)
    .join("\n");
}

async function askClaude(brain: Brain, conv: Conv, task: string, feedback?: string, avail?: Availability | null): Promise<Decision> {
  const { data: msgs } = await db()
    .from("ig_messages")
    .select("direction,text,created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const input = [
    `Nous sommes le ${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" })}, il est ${parisTime()} (heure de Paris).`,
    `Nom Instagram : ${conv.name ?? "inconnu"}`,
    `Étape actuelle : ${conv.stage}`,
    `Fiche : ${JSON.stringify(conv.fields)}`,
    `Relances déjà envoyées : ${conv.follow_ups}`,
    `Fuseau du prospect : ${conv.fields.fuseau ? conv.fields.fuseau : "inconnu (à demander avant de proposer des horaires)"}`,
    ...(avail
      ? avail.slots.length
        ? [`CRÉNEAUX iCLOSED libres (heure du prospect, fuseau ${avail.timeZone}) :`, ...avail.slots.map((s) => `- ${s.label} → identifiant ${s.utc}`)]
        : ["CRÉNEAUX iCLOSED : aucun créneau libre dans les 48 h, utilise le lien de réservation."]
      : []),
    "",
    "Conversation (du plus ancien au plus récent) :",
    transcript((msgs ?? []).reverse()),
    "",
    `Ta tâche : ${task}`,
    feedback ? `\nATTENTION, ta proposition précédente a été bloquée : ${feedback}. Corrige.` : "",
  ].join("\n");
  return decide({ system: `${RULES}\n\n${brainAsPrompt(brain)}`, input, schema: Decision, effort: "medium" });
}

/** Synchronise l'inbox PlugKit → base. Renvoie les conversations qui ont bougé. */
async function syncInbox(): Promise<string[]> {
  const initialized = await getSetting<boolean>("ig_initialized", false);
  const convs = await pk.listConversations(50);
  const changed: string[] = [];
  for (const c of convs) {
    const { data: known } = await db().from("ig_conversations").select("id,updated_at").eq("id", c.id).maybeSingle();
    if (known && new Date(known.updated_at).getTime() >= new Date(c.updatedTime).getTime()) continue;

    const msgs = await pk.listMessages(c.id, 40);
    const { data: existing } = await db().from("ig_messages").select("id").eq("conversation_id", c.id);
    const existingIds = new Set((existing ?? []).map((m) => m.id));
    const lastIn = [...msgs].reverse().find((m) => m.direction === "incoming");
    const lastOut = [...msgs].reverse().find((m) => m.direction === "outgoing");

    await db().from("ig_conversations").upsert({
      id: c.id,
      name: c.participantName,
      picture: c.participantPicture,
      // Au tout premier passage, l'historique existant reste à Luc (on ne relance pas les anciens).
      ...(known ? {} : { status: initialized ? "bot" : "human" }),
      last_inbound_at: lastIn?.createdAt ?? null,
      last_outbound_at: lastOut?.createdAt ?? null,
      updated_at: c.updatedTime,
    });
    if (msgs.length) {
      await db()
        .from("ig_messages")
        .upsert(msgs.map((m) => ({ id: m.id, conversation_id: c.id, direction: m.direction, text: m.message ?? "", created_at: m.createdAt })));
    }

    // Un message sortant que l'agent n'a pas envoyé = Luc a répondu depuis son téléphone → il a la main.
    if (known) {
      const newOut = msgs.filter((m) => m.direction === "outgoing" && !existingIds.has(m.id));
      if (newOut.length) {
        const { data: sent } = await db()
          .from("drafts")
          .select("content")
          .eq("ref_id", c.id)
          .eq("status", "sent")
          .gte("sent_at", new Date(Date.now() - DAY).toISOString());
        const ours = new Set((sent ?? []).map((d) => d.content.trim()));
        if (newOut.some((m) => !ours.has((m.message ?? "").trim()))) {
          const { data: conv } = await db().from("ig_conversations").select("status").eq("id", c.id).single();
          if (conv?.status === "bot") {
            await db().from("ig_conversations").update({ status: "human" }).eq("id", c.id);
            await logEvent("insta", `${c.participantName} : réponse manuelle détectée, l'agent laisse la main.`);
          }
        }
      }
    }
    changed.push(c.id);
  }
  if (!initialized) await setSetting("ig_initialized", true);
  return changed;
}

async function handle(conv: Conv, brain: Brain, mode: Mode, kind: "reply" | "followup"): Promise<boolean> {
  const { data: last } = await db()
    .from("ig_messages")
    .select("id,text,direction,created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!last) return false;

  // Déjà un brouillon pour ce dernier message ? On attend Luc.
  const { data: pending } = await db()
    .from("drafts")
    .select("id,meta")
    .eq("channel", "insta")
    .eq("ref_id", conv.id)
    .in("status", ["pending", "sending"]);
  if ((pending ?? []).some((d) => d.meta?.afterMessageId === last.id)) return false;
  // Déjà décidé pour ce message (ex. « wait ») : on n'y revient pas, sauf demande explicite (🔁).
  if (kind === "reply" && conv.last_decided_id === last.id) return false;

  if (kind === "reply" && isStopMessage(last.text)) {
    await db().from("ig_conversations").update({ status: "lost", stage: "perdu" }).eq("id", conv.id);
    await logEvent("insta", `${conv.name} a demandé d'arrêter : conversation close.`);
    return false;
  }

  const task =
    kind === "reply"
      ? "Décide de la suite et, si besoin, écris la réponse au dernier message du prospect."
      : `Le prospect n'a pas répondu depuis ton dernier message. Écris la relance n°${conv.follow_ups + 1} selon le cerveau (courte, avec de la valeur, sans pression), ou "wait" si une relance n'a pas de sens.`;

  const forbiddenWords = configValue<string[]>(brain, "forbiddenWords", []);
  const allowedUrls = [
    configValue<string>(brain, "bookingLink", ""),
    ...configValue<{ url: string }[]>(brain, "allowedLinks", []).map((l) => l.url),
  ];

  // Créneaux iClosed : seulement quand on approche de la prise de rendez-vous (évite des appels inutiles).
  let avail: Availability | null = null;
  const bookingLink = configValue<string>(brain, "bookingLink", "");
  if (iclosedEnabled() && bookingLink && ["ecart", "urgence", "engagement", "proposition_appel", "rdv_confirme"].includes(conv.stage)) {
    try {
      avail = await nextSlots(bookingLink, conv.fields.fuseau || "Europe/Paris");
    } catch (e) {
      await logEvent("insta", `${conv.name} : créneaux iClosed indisponibles (${e instanceof Error ? e.message : e}), lien de secours.`, "error");
    }
  }

  let decision: Decision;
  let problems: string[] = [];
  try {
    decision = await askClaude(brain, conv, task, undefined, avail);
    if (decision.action === "reply") {
      problems = checkOutgoing(decision.message, { forbiddenWords, allowedUrls, maxLength: 1000, channel: "dm" });
      if (problems.length) {
        decision = await askClaude(brain, conv, task, problems.join(" ; "), avail);
        problems = decision.action === "reply" ? checkOutgoing(decision.message, { forbiddenWords, allowedUrls, maxLength: 1000, channel: "dm" }) : [];
      }
    }
  } catch (e) {
    const label = e instanceof ClaudeRefusal ? "Claude a refusé : je te laisse la main." : claudeErrorLabel(e);
    await logEvent("insta", `${conv.name} : ${label}`, "error");
    if (e instanceof ClaudeRefusal) {
      await db().from("ig_conversations").update({ status: "human" }).eq("id", conv.id);
      await tg.alertLuc(`📸 <b>${tg.esc(conv.name)}</b> : ${tg.esc(label)}`);
    }
    return true;
  }

  const fields: Record<string, string> = { ...conv.fields, ...Object.fromEntries(decision.fields.map((f) => [f.key, f.value])) };
  if (decision.timezone && validTimeZone(decision.timezone)) fields.fuseau = decision.timezone;

  // Réservation demandée : on vérifie qu'elle est exacte avant de l'attacher au brouillon.
  let booking: Record<string, unknown> | null = null;
  if (decision.action === "reply" && decision.booking) {
    const b = decision.booking;
    const slot = avail?.slots.find((s) => s.utc === b.slot_utc);
    if (!slot) problems.push("créneau de réservation absent de la liste iClosed : réservation non faite");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) || !b.first_name.trim() || !b.last_name.trim()) problems.push("prénom, nom ou email manquant : réservation non faite");
    else
      booking = {
        utc: slot.utc,
        label: slot.label,
        timeZone: avail!.timeZone,
        email: b.email.trim(),
        firstName: b.first_name.trim(),
        lastName: b.last_name.trim(),
        hostIds: avail!.hostIds,
        bookingLink,
      };
  }
  await db()
    .from("ig_conversations")
    .update({ stage: decision.stage, fields, summary: decision.summary, last_decided_id: last.id })
    .eq("id", conv.id);

  if (decision.action === "stop_contact") {
    await db().from("ig_conversations").update({ status: "lost" }).eq("id", conv.id);
    return true;
  }
  if (decision.action === "escalate") {
    await db().from("ig_conversations").update({ status: "human" }).eq("id", conv.id);
    await tg.alertLuc(`📸 🙋 <b>À toi : ${tg.esc(conv.name)}</b>\n${tg.esc(decision.reason)}\n\n<i>Dernier message :</i> ${tg.esc(last.text)}`);
    await logEvent("insta", `${conv.name} : passé à Luc (${decision.reason})`);
    return true;
  }
  if (decision.action === "wait") {
    if (kind === "followup") await db().from("ig_conversations").update({ follow_ups: conv.follow_ups + 1 }).eq("id", conv.id);
    return true;
  }

  // Au-delà de 24 h sans message du prospect, Instagram refuse l'envoi par l'API.
  const inWindow = conv.last_inbound_at ? Date.now() - new Date(conv.last_inbound_at).getTime() < DAY - 10 * 60_000 : false;
  const canAuto = mode === "auto" && inWindow && problems.length === 0 && !(await isQuietHours());
  const header = `<b>${tg.esc(conv.name)}</b> · étape ${tg.esc(decision.stage)}${kind === "followup" ? " · relance" : ""}${
    inWindow ? "" : "\n⚠️ Hors fenêtre 24 h : à envoyer depuis le téléphone"
  }${booking ? `\n📅 <b>Réservation iClosed à l'envoi</b> : ${tg.esc(String(booking.label))} (${tg.esc(String(booking.timeZone))}), ${tg.esc(String(booking.email))}` : ""}\n<i>Dernier message :</i> ${tg.esc(last.text.slice(0, 300))}`;

  const draft = await createDraft({
    channel: "insta",
    refId: conv.id,
    content: decision.message,
    meta: {
      afterMessageId: last.id,
      followUp: kind === "followup",
      reason: problems.length ? `⚠️ ${problems.join(" ; ")}` : decision.reason,
      phoneOnly: !inWindow,
      ...(booking ? { booking } : {}),
    },
    header,
    notify: !canAuto,
  });
  if (canAuto) {
    const r = await sendDraft(draft.id, "auto");
    await logEvent("insta", `${conv.name} : ${r.ok ? "réponse envoyée" : `échec (${r.error})`}`, r.ok ? "info" : "error");
  }
  // Avec une réservation iClosed, l'alerte part au moment de la réservation (sendDraft).
  if (!booking && ["rdv_confirme"].includes(decision.stage) && conv.stage !== "rdv_confirme") {
    await tg.alertLuc(`📅 <b>Appel réservé</b> : ${tg.esc(conv.name)}\n${tg.esc(decision.summary)}`);
  }
  return true;
}

export async function runInsta(): Promise<string> {
  const modes = await getModes();
  if (modes.insta === "off") return "insta : coupé";
  const brain = await getBrain("insta");
  if (!brain.docs.length) return "insta : cerveau vide";

  const changed = await syncInbox();

  // 1) Réponses : le dernier message est du prospect.
  const { data: convs } = await db()
    .from("ig_conversations")
    .select("id,name,status,stage,fields,last_inbound_at,last_outbound_at,follow_ups,last_decided_id")
    .eq("status", "bot")
    .order("updated_at", { ascending: false })
    .limit(60);
  let handled = 0;
  const minDelay = modes.insta === "auto" ? 90_000 : 0; // délai « humain » en automatique
  for (const c of (convs ?? []) as Conv[]) {
    if (handled >= 6) break;
    const inbound = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : 0;
    const outbound = c.last_outbound_at ? new Date(c.last_outbound_at).getTime() : 0;
    if (inbound > outbound) {
      if (Date.now() - inbound < minDelay) continue;
      if (await handle(c, brain, modes.insta, "reply")) handled++;
      continue;
    }
    // 2) Relances : le dernier message est de nous et le délai du cerveau est passé.
    const schedule = configValue<number[]>(brain, "followUpAfterHours", [24, 72, 168]);
    const max = configValue<number>(brain, "maxFollowUps", 3);
    if (outbound && c.follow_ups < max && !["rdv_confirme", "hors_cible", "perdu"].includes(c.stage)) {
      const after = (schedule[c.follow_ups] ?? schedule[schedule.length - 1] ?? 72) * 3600_000;
      if (Date.now() - outbound >= after) {
        if (await handle(c, brain, modes.insta, "followup")) handled++;
      }
    }
  }
  return `insta : ${changed.length} conversation(s) synchronisée(s), ${handled} traitée(s)`;
}

/** Régénère une proposition (bouton 🔁 Autre version). */
export async function redoInsta(conversationId: string): Promise<void> {
  const { data: conv } = await db().from("ig_conversations").select("*").eq("id", conversationId).single();
  if (!conv) return;
  const brain = await getBrain("insta");
  const inbound = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
  const outbound = conv.last_outbound_at ? new Date(conv.last_outbound_at).getTime() : 0;
  // Forcer une nouvelle proposition : on retire le verrou « déjà proposé ».
  await db().from("drafts").update({ meta: {} }).eq("channel", "insta").eq("ref_id", conversationId).eq("status", "pending");
  await handle({ ...(conv as Conv), last_decided_id: null }, brain, "supervised", inbound > outbound ? "reply" : "followup");
}
