import { env } from "./env";

/** Bot Telegram : validation des brouillons (Luc) et alertes setting (équipe). */

export type Button = { text: string; callback_data?: string; url?: string };
export type Keyboard = Button[][];

function token(): string {
  return env("TELEGRAM_BOT_TOKEN");
}

export function validationChat(): string {
  return env("TELEGRAM_VALIDATION_CHAT_ID");
}

export function settingChat(): string {
  return env("TELEGRAM_SETTING_CHAT_ID");
}

export function telegramReady(): boolean {
  return token() !== "" && validationChat() !== "";
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!token()) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      console.error(`Telegram ${method}: ${json.description}`);
      return null;
    }
    return json.result ?? null;
  } catch (e) {
    console.error(`Telegram ${method}`, e);
    return null;
  }
}

/** Échappe le HTML Telegram. */
export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendMessage(chatId: string, html: string, keyboard?: Keyboard, extra: Record<string, unknown> = {}) {
  if (!chatId) return null;
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: html.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...extra,
  });
}

export async function sendPhoto(chatId: string, photoUrl: string, captionHtml: string, keyboard?: Keyboard) {
  if (!chatId) return null;
  return call<{ message_id: number }>("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption: captionHtml.slice(0, 1000),
    parse_mode: "HTML",
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export async function editMessage(chatId: string, messageId: number, html: string, keyboard?: Keyboard) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

export async function editCaption(chatId: string, messageId: number, html: string, keyboard?: Keyboard) {
  return call("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption: html.slice(0, 1000),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

export async function answerCallback(id: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id: id, text });
}

export async function setWebhook(url: string, secret: string) {
  return call("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"] });
}

/** Alerte à Luc (groupe Validation). */
export async function alertLuc(html: string) {
  return sendMessage(validationChat(), html);
}

/** Secret du webhook Telegram, dérivé du token (aucune variable en plus). */
export async function webhookSecret(): Promise<string> {
  const data = new TextEncoder().encode(`tg:${token()}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
