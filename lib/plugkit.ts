import { requireEnv } from "./env";

/** Client PlugKit (https://docs.plugkit.co) : lecture et envoi des DM Instagram. */

const BASE = "https://api.plugkit.co/v1";

export type PkConversation = {
  id: string;
  participantName: string;
  participantPicture: string | null;
  lastMessage: { text: string; direction: "incoming" | "outgoing"; createdAt: string } | null;
  updatedTime: string;
  lastInboundAt: string | null;
};

export type PkMessage = {
  id: string;
  message: string;
  direction: "incoming" | "outgoing";
  createdAt: string;
};

async function req<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${requireEnv("PLUGKIT_API_KEY")}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PlugKit ${res.status} : ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export async function listConversations(limit = 50): Promise<PkConversation[]> {
  const accountId = encodeURIComponent(requireEnv("PLUGKIT_ACCOUNT_ID"));
  const r = await req<{ data?: PkConversation[]; conversations?: PkConversation[] }>(
    "GET",
    `/inbox/conversations?accountId=${accountId}&platform=instagram&page=1&limit=${limit}`,
  );
  return r.data ?? r.conversations ?? [];
}

export async function listMessages(conversationId: string, limit = 40): Promise<PkMessage[]> {
  const r = await req<{ messages?: PkMessage[] }>("GET", `/inbox/conversations/${conversationId}/messages?limit=${limit}`);
  return (r.messages ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Envoi d'un DM. Irréversible. Instagram limite à 1000 caractères. */
export async function sendMessage(conversationId: string, text: string, idempotencyKey: string): Promise<string> {
  const r = await req<Record<string, unknown>>(
    "POST",
    `/inbox/conversations/${conversationId}/messages`,
    { text: text.slice(0, 1000) },
    { "Idempotency-Key": idempotencyKey },
  );
  const inner = (r.message ?? r.data ?? r) as Record<string, unknown>;
  return String(inner.id ?? inner._id ?? inner.messageId ?? "");
}
