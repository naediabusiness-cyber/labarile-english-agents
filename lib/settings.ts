import { db, type Agent } from "./db";

export type Mode = "off" | "supervised" | "auto";
export type Modes = Record<Agent, Mode>;

export type Brand = {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  logoUrl: string;
  fontUrl: string;
};

export const DEFAULT_BRAND: Brand = {
  name: "Labarile English",
  primary: "#0B2545",
  secondary: "#13315C",
  accent: "#E63946",
  background: "#F7F4EE",
  text: "#0B2545",
  logoUrl: "",
  fontUrl: "",
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  const { error } = await db().from("settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function getModes(): Promise<Modes> {
  return getSetting<Modes>("modes", { insta: "off", mail: "off", support: "off", stories: "off" });
}

export async function getBrand(): Promise<Brand> {
  return { ...DEFAULT_BRAND, ...(await getSetting<Partial<Brand>>("brand", {})) };
}

/** Heure de Paris au format HH:MM. */
export function parisTime(d = new Date()): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** Date de Paris au format AAAA-MM-JJ. */
export function parisDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}

export async function isQuietHours(d = new Date()): Promise<boolean> {
  const q = await getSetting<{ start: string; end: string }>("quiet_hours", { start: "22:00", end: "08:00" });
  const now = parisTime(d);
  return q.start > q.end ? now >= q.start || now < q.end : now >= q.start && now < q.end;
}

/** Convertit « AAAA-MM-JJ HH:MM » heure de Paris en Date UTC. */
export function parisToUtc(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const utcShown = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (shown.getTime() - utcShown.getTime()));
}
