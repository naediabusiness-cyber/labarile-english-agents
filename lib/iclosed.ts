import { env } from "./env";

/**
 * iClosed (API officielle, https://developer.iclosed.io) : créneaux libres des closers et réservation d'un appel.
 * Clé : ICLOSED_API_KEY (Settings → Developers → API Keys, commence par « iclosed_ »), dans Vercel uniquement.
 * Sans clé, l'agent retombe sur le lien de réservation.
 */

const API = "https://public.api.iclosed.io/v1";

export type Slot = {
  /** Identifiant exact à renvoyer pour réserver : date-heure ISO en UTC. */
  utc: string;
  /** Jour et heure dans le fuseau du prospect, ex. « mercredi 30 septembre à 10:30 ». */
  label: string;
  date: string;
  time: string;
};

export type Availability = { timeZone: string; slots: Slot[]; hostIds: number[] };

export function iclosedEnabled(): boolean {
  return env("ICLOSED_API_KEY") !== "";
}

/** « luclabarile/parle-anglais… » à partir du lien de réservation https://app.iclosed.io/e/… */
export function linkPrefix(bookingLink: string): string | null {
  return bookingLink.match(/iclosed\.io\/e\/([^?#]+)/)?.[1]?.replace(/\/$/, "") ?? null;
}

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
    return /\//.test(tz) || tz === "UTC";
  } catch {
    return false;
  }
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("ICLOSED_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as T & { message?: string };
  if (!res.ok) throw new Error(`iClosed ${res.status} : ${json.message ?? text.slice(0, 200)}`);
  return json;
}

/** Date-heure locale (fuseau `tz`) → instant UTC. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

function label(utc: Date, tz: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(utc);
}

/**
 * Les prochains créneaux libres dans le fuseau du prospect.
 * Par défaut : au moins 2 h à l'avance, au plus 48 h, les 6 premiers.
 */
export async function nextSlots(bookingLink: string, timeZone: string, opts: { minLeadMinutes?: number; withinHours?: number; max?: number } = {}): Promise<Availability> {
  const prefix = linkPrefix(bookingLink);
  if (!prefix) throw new Error("Lien de réservation iClosed introuvable dans le cerveau (bookingLink).");
  const tz = validTimeZone(timeZone) ? timeZone : "Europe/Paris";
  const r = await call<{ data: { availabilities: Record<string, string[]>; appliedHostIds?: number[] } }>("/events/eventDates", {
    linkPrefix: prefix,
    timeZone: tz,
    currentDate: todayIn(tz),
  });
  const now = Date.now();
  const from = now + (opts.minLeadMinutes ?? 120) * 60_000;
  const to = now + (opts.withinHours ?? 48) * 3600_000;
  const slots: Slot[] = [];
  for (const [date, times] of Object.entries(r.data?.availabilities ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    for (const time of [...times].sort()) {
      const utc = zonedToUtc(date, time, tz);
      if (utc.getTime() < from || utc.getTime() > to) continue;
      slots.push({ utc: utc.toISOString(), label: label(utc, tz), date, time });
    }
  }
  return { timeZone: tz, slots: slots.slice(0, opts.max ?? 6), hostIds: r.data?.appliedHostIds ?? [] };
}

export type Booking = { utc: string; timeZone: string; email: string; firstName: string; lastName: string; hostIds?: number[] };

/** Réserve l'appel dans iClosed (le closer disponible est assigné par iClosed). */
export async function bookCall(bookingLink: string, b: Booking): Promise<{ closerName?: string; confirmationLink?: string }> {
  const prefix = linkPrefix(bookingLink);
  if (!prefix) throw new Error("Lien de réservation iClosed introuvable (bookingLink).");
  const r = await call<{ data?: { eventCall?: { closerName?: string; confirmationLink?: string } } }>("/eventCalls", {
    linkPrefix: prefix,
    email: b.email,
    firstName: b.firstName,
    lastName: b.lastName,
    dateTime: b.utc,
    timeZone: b.timeZone,
    secondaryQuestionsAnswer: [],
    ...(b.hostIds?.length ? { conditionalUsers: b.hostIds.join(",") } : {}),
  });
  return { closerName: r.data?.eventCall?.closerName, confirmationLink: r.data?.eventCall?.confirmationLink };
}
