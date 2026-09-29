import { PLACEHOLDER } from "./brains";

/** Vérifications appliquées à tout message avant qu'il parte. Renvoie la liste des problèmes. */
export function checkOutgoing(
  text: string,
  opts: { forbiddenWords?: string[]; allowedUrls?: string[]; maxLength?: number; channel: "dm" | "email" },
): string[] {
  const problems: string[] = [];
  const t = text.trim();
  if (!t) problems.push("message vide");
  if (t.includes(PLACEHOLDER)) problems.push("le message contient un [À REMPLIR] du cerveau");
  if (opts.maxLength && t.length > opts.maxLength) problems.push(`trop long (${t.length} > ${opts.maxLength} caractères)`);

  const lower = t.toLowerCase();
  for (const w of opts.forbiddenWords ?? []) {
    if (w && !w.includes(PLACEHOLDER) && lower.includes(w.toLowerCase())) problems.push(`mot interdit : « ${w} »`);
  }

  const allowed = (opts.allowedUrls ?? []).filter((u) => u && !u.includes(PLACEHOLDER));
  for (const url of t.match(/https?:\/\/[^\s)>\]]+/g) ?? []) {
    if (!allowed.some((a) => url.startsWith(a))) problems.push(`lien non autorisé : ${url}`);
  }

  if (opts.channel === "dm") {
    if ((t.match(/\?/g) ?? []).length > 2) problems.push("plus de deux questions dans un seul DM");
    if (/^\s*[-•*]\s/m.test(t)) problems.push("liste à puces dans un DM");
  }
  return problems;
}

const STOP = /^\s*(stop|arr[êe]te[sz]?|d[ée]sinscri|unsubscribe|laisse[sz]?[- ]moi tranquille|ne me contacte[sz]? plus)\b/i;

export function isStopMessage(text: string): boolean {
  return STOP.test(text.trim());
}
