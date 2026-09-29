import Link from "next/link";
import { getBrain, missingPlaceholders } from "@/lib/brains";
import type { Agent } from "@/lib/db";
import { fmt } from "../ui";

export const dynamic = "force-dynamic";

const AGENTS: [Agent, string][] = [["insta", "📸 Instagram DM"], ["mail", "✉️ Mails"], ["support", "🛟 Support"], ["stories", "🎨 Stories"]];

export default async function Brains() {
  const brains = await Promise.all(AGENTS.map(async ([a]) => getBrain(a)));
  return (
    <>
      <h1>Cerveaux</h1>
      <p className="muted small">Ce que chaque agent sait : méthode, voix, offre, objections, politique. Tout se modifie ici, sans toucher au code. Tant qu&apos;il reste des « [À REMPLIR] », l&apos;agent ne peut pas passer en automatique.</p>
      <div className="grid">
        {AGENTS.map(([a, label], i) => {
          const missing = missingPlaceholders(brains[i]);
          return (
            <Link href={`/admin/cerveaux/${a}`} className="card" key={a}>
              <b>{label}</b>
              <div className="small muted">{brains[i].docs.length} document(s) · modifié {fmt(brains[i].updated_at)}</div>
              <div className="small" style={{ marginTop: 6, color: missing.length ? "var(--warn)" : "var(--ok)" }}>
                {brains[i].docs.length === 0 ? "Vide : lancer npm run brain:push" : missing.length ? `${missing.length} élément(s) à remplir` : "Complet ✅"}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
