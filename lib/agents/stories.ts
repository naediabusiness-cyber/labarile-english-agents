import sharp from "sharp";
import { z } from "zod";
import { db, logEvent } from "../db";
import { getBrain, brainAsPrompt, configValue } from "../brains";
import { decide, claudeErrorLabel } from "../claude";
import { getModes, getBrand, getSetting, setSetting, parisDate, parisTime, parisToUtc } from "../settings";
import { renderStory } from "../story-image";
import { publishStory, refreshTokenIfNeeded } from "../instagram";
import { hasEnv } from "../env";
import * as tg from "../telegram";

/**
 * Agent STORIES : chaque matin, Claude écrit les stories du jour (cerveau « stories »),
 * elles sont rendues aux couleurs de Labarile, envoyées à Luc sur Telegram, puis publiées à l'heure prévue.
 */

const TEMPLATES = ["astuce", "erreur", "citation", "question", "appel"] as const;

const Batch = z.object({
  stories: z.array(
    z.object({
      template: z.enum(TEMPLATES),
      title: z.string().describe("≤ 40 caractères"),
      body: z.string().describe("≤ 160 caractères"),
      cta: z.string().describe("Appel à l'action court (ex. « Envoyez ENGLISH en DM »), ou vide"),
    }),
  ),
});

const RULES = `Tu es l'agent stories Instagram de Labarile English. Tu écris le texte des stories du jour, en français, selon la ligne éditoriale ci-dessous.
Règles : titre ≤ 40 caractères, texte ≤ 160 caractères, une idée par story, aucun témoignage ni chiffre inventé, aucun emoji (le rendu graphique ne les affiche pas), ne reprends pas un sujet déjà publié récemment.
Tu ne dois jamais utiliser une information marquée « [À REMPLIR ». Le CTA principal est « Envoyez <ctaKeyword> en DM » (mot-clé des réglages) ; « Réservez votre entretien (lien en bio) » sert à varier.`;

export function storyImageUrl(appUrl: string, id: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/stories/${id}/image?v=${Date.now()}`;
}

export function storyKeyboard(id: string): tg.Keyboard {
  return [[
    { text: "✅ Programmer", callback_data: `st:ok:${id}` },
    { text: "🔁 Autre version", callback_data: `st:redo:${id}` },
    { text: "❌ Supprimer", callback_data: `st:no:${id}` },
  ]];
}

async function randomPhoto(): Promise<string | null> {
  const { data } = await db().storage.from("photos").list("", { limit: 100 });
  const files = (data ?? []).filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
  if (!files.length) return null;
  const pick = files[Math.floor(Math.random() * files.length)];
  return db().storage.from("photos").getPublicUrl(pick.name).data.publicUrl;
}

async function recentTitles(): Promise<string[]> {
  const { data } = await db().from("stories").select("title").order("created_at", { ascending: false }).limit(40);
  return (data ?? []).map((s) => s.title);
}

export async function writeStories(count: number, hint?: string) {
  const brain = await getBrain("stories");
  const recent = await recentTitles();
  const res = await decide({
    system: `${RULES}\n\n${brainAsPrompt(brain)}`,
    input: `Écris ${count} stories pour aujourd'hui (${parisDate()}), en variant les gabarits.${hint ? ` Consigne : ${hint}` : ""}\nDéjà publiés récemment (à ne pas répéter) :\n- ${recent.join("\n- ") || "rien"}`,
    schema: Batch,
    effort: "medium",
  });
  return res.stories.slice(0, count);
}

async function sendForApproval(id: string, caption: string) {
  const appUrl = await getSetting<string>("app_url", "");
  if (!appUrl) return;
  await tg.sendPhoto(tg.validationChat(), storyImageUrl(appUrl, id), caption, storyKeyboard(id));
}

async function generateToday(mode: "supervised" | "auto") {
  const brain = await getBrain("stories");
  const hours = configValue<string[]>(brain, "postingHours", ["12:30", "19:00"]);
  const perWeek = configValue<number>(brain, "perWeek", 7);
  const count = Math.max(1, Math.min(hours.length, Math.ceil(perWeek / 7)));
  const stories = await writeStories(count);
  const today = parisDate();
  for (let i = 0; i < stories.length; i++) {
    const s = stories[i];
    const photo = s.template === "citation" || s.template === "appel" ? await randomPhoto() : null;
    const { data } = await db()
      .from("stories")
      .insert({
        template: s.template,
        title: s.title,
        body: s.body,
        cta: s.cta || null,
        photo_url: photo,
        status: mode === "auto" ? "approved" : "draft",
        scheduled_for: parisToUtc(today, hours[i] ?? hours[hours.length - 1]).toISOString(),
      })
      .select()
      .single();
    if (data) {
      await sendForApproval(
        data.id,
        `🎨 <b>Story ${i + 1}/${stories.length}</b> · ${tg.esc(s.template)} · prévue à ${tg.esc(hours[i] ?? "")}${mode === "auto" ? "\n<i>Mode auto : sera publiée sauf si tu la supprimes.</i>" : ""}`,
      );
    }
  }
  await logEvent("stories", `${stories.length} story(s) préparée(s) pour aujourd'hui`);
}

/** Rendu JPEG → bucket public « stories » → publication Instagram. */
export async function publish(id: string): Promise<void> {
  const { data: s } = await db().from("stories").select("*").eq("id", id).single();
  if (!s) return;
  try {
    const img = await renderStory(s, await getBrand());
    const jpeg = await sharp(Buffer.from(await img.arrayBuffer())).jpeg({ quality: 90 }).toBuffer();
    const path = `${id}.jpg`;
    const up = await db().storage.from("stories").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new Error(`stockage : ${up.error.message}`);
    const url = db().storage.from("stories").getPublicUrl(path).data.publicUrl;
    const mediaId = await publishStory(url);
    await db().from("stories").update({ status: "published", image_url: url, ig_media_id: mediaId, error: null }).eq("id", id);
    await logEvent("stories", `Story publiée : ${s.title}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db().from("stories").update({ status: "failed", error }).eq("id", id);
    await logEvent("stories", `Échec de publication « ${s.title} » : ${error}`, "error");
    await tg.alertLuc(`🎨 ❌ Story non publiée « ${tg.esc(s.title)} » : ${tg.esc(error)}`);
  }
}

export async function runStories(): Promise<string> {
  const modes = await getModes();
  if (modes.stories === "off") return "stories : coupé";
  const today = parisDate();
  const notes: string[] = [];

  // 1) Préparer les stories du jour, à partir de 7 h (heure de Paris), une seule fois par jour.
  const done = await getSetting<string>("stories_generated_for", "");
  if (done !== today && parisTime() >= "07:00") {
    await setSetting("stories_generated_for", today);
    try {
      await generateToday(modes.stories);
      notes.push("stories du jour préparées");
    } catch (e) {
      await logEvent("stories", claudeErrorLabel(e), "error");
    }
  }

  // 2) Publier celles qui sont validées et dont l'heure est passée.
  if (!hasEnv("META_IG_USER_ID", "META_ACCESS_TOKEN")) return `stories : ${notes.join(", ") || "rien"} (publication Instagram non configurée)`;
  try {
    await refreshTokenIfNeeded();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Une alerte par jour au plus (la boucle tourne toutes les 3 minutes).
    if ((await getSetting<string>("meta_token_alert_for", "")) !== today) {
      await setSetting("meta_token_alert_for", today);
      await logEvent("stories", msg, "error");
      await tg.alertLuc(`🎨 ⚠️ ${tg.esc(msg)} : régénère META_ACCESS_TOKEN (voir PLAYBOOK, phase 9).`);
    }
  }
  const { data: due } = await db()
    .from("stories")
    .select("id")
    .eq("status", "approved")
    .lte("scheduled_for", new Date().toISOString())
    .limit(3);
  for (const s of due ?? []) await publish(s.id);
  if (due?.length) notes.push(`${due.length} publiée(s)`);
  return `stories : ${notes.join(", ") || "rien à faire"}`;
}

/** 🔁 Autre version d'une story (même gabarit, même horaire). */
export async function redoStory(id: string, hint?: string) {
  const { data: old } = await db().from("stories").select("*").eq("id", id).single();
  if (!old) return;
  const [s] = await writeStories(1, `gabarit « ${old.template} », différent de « ${old.title} »${hint ? `. ${hint}` : ""}`);
  if (!s) return;
  await db().from("stories").update({ status: "rejected" }).eq("id", id);
  const { data } = await db()
    .from("stories")
    .insert({ template: s.template, title: s.title, body: s.body, cta: s.cta || null, photo_url: old.photo_url, status: "draft", scheduled_for: old.scheduled_for })
    .select()
    .single();
  if (data) await sendForApproval(data.id, `🎨 <b>Nouvelle version</b> · ${tg.esc(s.template)}`);
}
