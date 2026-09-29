"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { db, logEvent, type Agent } from "@/lib/db";
import { getModes, setSetting, getSetting, type Mode, type Brand, DEFAULT_BRAND } from "@/lib/settings";
import { getBrain, saveBrain, missingPlaceholders, type BrainDoc } from "@/lib/brains";
import { sendDraft, rejectDraft, updateDraftContent } from "@/lib/drafts";
import { applyDecision } from "@/lib/agents/support";
import { writeStories, publish } from "@/lib/agents/stories";
import { tick } from "@/lib/agents";
import { parisDate, parisTime } from "@/lib/settings";
import * as tg from "@/lib/telegram";

/** Chaque action vérifie la session (en plus du proxy). */
async function guard() {
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ── Modes ────────────────────────────────────────────────────────────────────
export async function setMode(formData: FormData) {
  await guard();
  const agent = String(formData.get("agent")) as Agent;
  const mode = String(formData.get("mode")) as Mode;
  if (mode === "auto") {
    const missing = missingPlaceholders(await getBrain(agent));
    if (missing.length) redirect(`/admin?error=${encodeURIComponent(`${agent} : il reste ${missing.length} « [À REMPLIR] » dans le cerveau, l'automatique est bloqué.`)}`);
  }
  await setSetting("modes", { ...(await getModes()), [agent]: mode });
  await logEvent("system", `Tableau de bord : ${agent} → ${mode}`);
  revalidatePath("/admin");
}

// ── Brouillons ───────────────────────────────────────────────────────────────
export async function draftAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const action = String(formData.get("action"));
  const content = formData.get("content");
  if (typeof content === "string" && content.trim()) await updateDraftContent(id, content.trim());
  if (action === "send") {
    const r = await sendDraft(id, "tableau de bord");
    if (!r.ok) redirect(`/admin/brouillons?error=${encodeURIComponent(r.error ?? "échec")}`);
  } else if (action === "drop") {
    await rejectDraft(id, "Ignoré (tableau de bord)");
  }
  revalidatePath("/admin/brouillons");
}

// ── Instagram ────────────────────────────────────────────────────────────────
export async function setConversationStatus(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["bot", "human", "booked", "lost", "out"].includes(status)) return;
  await db().from("ig_conversations").update({ status }).eq("id", id);
  revalidatePath(`/admin/instagram/${id}`);
  revalidatePath("/admin/instagram");
}

// ── Support ──────────────────────────────────────────────────────────────────
export async function supportDecision(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) === "accorde" ? "accorde" : "refuse";
  await applyDecision(id, decision, "tableau de bord");
  revalidatePath("/admin/support");
}

export async function closeTicket(formData: FormData) {
  await guard();
  await db().from("support_tickets").update({ status: "resolu", updated_at: new Date().toISOString() }).eq("id", String(formData.get("id")));
  revalidatePath("/admin/support");
}

// ── Setting ──────────────────────────────────────────────────────────────────
export async function markCalled(formData: FormData) {
  await guard();
  await db().from("setting_alerts").update({ done_at: new Date().toISOString(), claimed_by: "tableau de bord" }).eq("id", String(formData.get("id")));
  revalidatePath("/admin/mails");
}

// ── Stories ──────────────────────────────────────────────────────────────────
export async function generateStoriesNow(formData: FormData) {
  await guard();
  const count = Math.min(5, Math.max(1, Number(formData.get("count") ?? 1)));
  const hint = String(formData.get("hint") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim() || parisTime();
  const stories = await writeStories(count, hint || undefined);
  const { parisToUtc } = await import("@/lib/settings");
  for (const s of stories) {
    await db().from("stories").insert({
      template: s.template,
      title: s.title,
      body: s.body,
      cta: s.cta || null,
      status: "draft",
      scheduled_for: parisToUtc(parisDate(), time).toISOString(),
    });
  }
  revalidatePath("/admin/stories");
}

export async function storyAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const action = String(formData.get("action"));
  if (action === "approve") await db().from("stories").update({ status: "approved" }).eq("id", id);
  if (action === "reject") await db().from("stories").update({ status: "rejected" }).eq("id", id);
  if (action === "publish") await publish(id);
  if (action === "save") {
    await db()
      .from("stories")
      .update({
        title: String(formData.get("title") ?? ""),
        body: String(formData.get("body") ?? ""),
        cta: String(formData.get("cta") ?? "") || null,
      })
      .eq("id", id);
  }
  revalidatePath("/admin/stories");
}

export async function uploadPhoto(formData: FormData) {
  await guard();
  const file = formData.get("photo");
  if (!(file instanceof File) || !file.size) return;
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z]/g, "");
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db().storage.from("photos").upload(name, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "image/jpeg" });
  if (error) redirect(`/admin/stories?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/stories");
}

export async function deletePhoto(formData: FormData) {
  await guard();
  await db().storage.from("photos").remove([String(formData.get("name"))]);
  revalidatePath("/admin/stories");
}

// ── Cerveaux ─────────────────────────────────────────────────────────────────
export async function saveBrainForm(formData: FormData) {
  await guard();
  const agent = String(formData.get("agent")) as Agent;
  const names = formData.getAll("doc_name").map(String);
  const contents = formData.getAll("doc_content").map(String);
  const docs: BrainDoc[] = names.map((name, i) => ({ name: name.trim(), content: contents[i] ?? "" })).filter((d) => d.name);
  const newName = String(formData.get("new_name") ?? "").trim();
  if (newName) docs.push({ name: newName.endsWith(".md") ? newName : `${newName}.md`, content: "" });
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(String(formData.get("config") ?? "{}"));
  } catch {
    redirect(`/admin/cerveaux/${agent}?error=${encodeURIComponent("Les réglages (JSON) sont invalides : vérifie les virgules et guillemets.")}`);
  }
  await saveBrain(agent, docs, config);
  await logEvent("system", `Cerveau ${agent} modifié depuis le tableau de bord`);
  revalidatePath(`/admin/cerveaux/${agent}`);
  redirect(`/admin/cerveaux/${agent}?saved=1`);
}

// ── Réglages ─────────────────────────────────────────────────────────────────
export async function saveBrand(formData: FormData) {
  await guard();
  const brand: Brand = { ...DEFAULT_BRAND };
  for (const k of Object.keys(DEFAULT_BRAND) as (keyof Brand)[]) {
    const v = formData.get(k);
    if (typeof v === "string") brand[k] = v.trim();
  }
  await setSetting("brand", brand);
  revalidatePath("/admin/reglages");
}

export async function saveQuietHours(formData: FormData) {
  await guard();
  await setSetting("quiet_hours", { start: String(formData.get("start") || "22:00"), end: String(formData.get("end") || "08:00") });
  revalidatePath("/admin/reglages");
}

// ── Installation ─────────────────────────────────────────────────────────────
async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function saveAppUrl(formData: FormData) {
  await guard();
  const url = String(formData.get("app_url") ?? "").trim().replace(/\/$/, "") || (await currentOrigin());
  await setSetting("app_url", url);
  revalidatePath("/admin/installation");
}

export async function connectTelegram() {
  await guard();
  const appUrl = await getSetting<string>("app_url", "");
  if (!appUrl) redirect(`/admin/installation?error=${encodeURIComponent("Enregistre d'abord l'adresse de l'app.")}`);
  const ok = await tg.setWebhook(`${appUrl}/api/telegram`, await tg.webhookSecret());
  if (!ok) redirect(`/admin/installation?error=${encodeURIComponent("Telegram a refusé : vérifie TELEGRAM_BOT_TOKEN.")}`);
  await setSetting("telegram_webhook", `${appUrl}/api/telegram`);
  revalidatePath("/admin/installation");
}

export async function testTelegram() {
  await guard();
  await tg.sendMessage(tg.validationChat(), "✅ Labarile Agents est connecté (groupe Validation).");
  if (tg.settingChat()) await tg.sendMessage(tg.settingChat(), "✅ Labarile Agents est connecté (groupe Setting).");
  revalidatePath("/admin/installation");
}

export async function runTickNow() {
  await guard();
  const results = await tick();
  await setSetting("last_tick", { at: new Date().toISOString(), results, manual: true });
  revalidatePath("/admin/installation");
  revalidatePath("/admin");
}
