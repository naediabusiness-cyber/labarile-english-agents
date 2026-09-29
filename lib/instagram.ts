import { env, requireEnv } from "./env";
import { getSetting, setSetting } from "./settings";

/**
 * Publication de stories via l'API Graph d'Instagram (content publishing).
 * L'image doit être un JPEG accessible publiquement (bucket Supabase « stories »).
 */

function base(): string {
  const host = env("META_GRAPH_HOST") || "graph.instagram.com";
  const version = env("META_GRAPH_VERSION") || "v23.0";
  return `https://${host}/${version}`;
}

type StoredToken = { token: string; at: string; from: string };

/** Empreinte du jeton de Vercel : s'il change (Luc en a collé un nouveau), le jeton rafraîchi en base est oublié. */
const envTag = () => requireEnv("META_ACCESS_TOKEN").slice(-12);

async function stored(): Promise<StoredToken | null> {
  const s = await getSetting<StoredToken | null>("meta_token", null);
  return s && s.from === envTag() ? s : null;
}

/** Le jeton rafraîchi (en base) prime sur celui de Vercel, qui n'est que le point de départ. */
async function token(): Promise<string> {
  return (await stored())?.token || requireEnv("META_ACCESS_TOKEN");
}

/**
 * Les jetons Instagram longue durée expirent au bout de 60 jours : on les renouvelle chaque semaine.
 * (Connexion Instagram uniquement ; un jeton de page Facebook n'expire pas.)
 */
export async function refreshTokenIfNeeded(): Promise<void> {
  if ((env("META_GRAPH_HOST") || "graph.instagram.com") !== "graph.instagram.com") return;
  const current = await stored();
  if (current && Date.now() - new Date(current.at).getTime() < 7 * 24 * 3600_000) return;
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(await token())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = (await res.json()) as { access_token?: string; error?: { message: string } };
  if (!res.ok || !json.access_token) throw new Error(`Renouvellement du jeton Instagram impossible : ${json.error?.message ?? res.status}`);
  await setSetting("meta_token", { token: json.access_token, at: new Date().toISOString(), from: envTag() });
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: await token() });
  const res = await fetch(`${base()}${path}`, { method: "POST", body, signal: AbortSignal.timeout(30_000) });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(`Instagram : ${json.error?.message ?? res.status}`);
  return json;
}

async function containerStatus(id: string): Promise<string> {
  const url = `${base()}/${id}?fields=status_code&access_token=${encodeURIComponent(await token())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = (await res.json()) as { status_code?: string };
  return json.status_code ?? "UNKNOWN";
}

export async function publishStory(imageUrl: string): Promise<string> {
  const igUser = requireEnv("META_IG_USER_ID");
  const container = await graph<{ id: string }>(`/${igUser}/media`, { media_type: "STORIES", image_url: imageUrl });
  // Attendre que Meta ait téléchargé l'image (quelques secondes en général).
  for (let i = 0; i < 10; i++) {
    const status = await containerStatus(container.id);
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`Instagram : conteneur ${status}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  const published = await graph<{ id: string }>(`/${igUser}/media_publish`, { creation_id: container.id });
  return published.id;
}
