/** Petits composants partagés du tableau de bord. */

export function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const TONE: Record<string, string> = {
  bot: "ok", auto: "ok", sent: "ok", replied: "ok", published: "ok", booked: "ok", resolu: "ok", approved: "ok",
  human: "warn", supervised: "warn", pending: "warn", drafted: "warn", draft: "warn", attente_decision: "warn", escalated: "warn", attente_client: "warn",
  error: "err", failed: "err", lost: "err", off: "err", rejected: "err",
};

const LABEL: Record<string, string> = {
  bot: "agent", human: "Luc", booked: "RDV", lost: "perdu", out: "hors cible",
  off: "coupé", supervised: "supervisé", auto: "automatique",
  pending: "à valider", sent: "envoyé", rejected: "ignoré", failed: "échec", superseded: "remplacé",
  new: "nouveau", drafted: "brouillon", replied: "répondu", ignored: "ignoré", escalated: "pour Luc", forwarded: "→ support",
  ouvert: "ouvert", attente_client: "attente client", attente_decision: "décision à prendre", resolu: "résolu",
  draft: "à valider", approved: "programmée", published: "publiée",
};

export function Badge({ value }: { value: string | null | undefined }) {
  const v = value ?? "";
  return <span className={`badge ${TONE[v] ?? ""}`}>{LABEL[v] ?? v}</span>;
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  if (typeof sp.error === "string") return <div className="card" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>{sp.error}</div>;
  if (sp.saved) return <div className="card" style={{ borderColor: "var(--ok)", color: "var(--ok)" }}>Enregistré ✅</div>;
  return null;
}
