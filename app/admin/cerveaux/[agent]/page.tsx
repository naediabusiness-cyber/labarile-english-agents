import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrain, missingPlaceholders } from "@/lib/brains";
import type { Agent } from "@/lib/db";
import { saveBrainForm } from "../../actions";
import { Flash } from "../../ui";

export const dynamic = "force-dynamic";

const AGENTS: Agent[] = ["insta", "mail", "support", "stories"];

export default async function BrainEditor(props: PageProps<"/admin/cerveaux/[agent]">) {
  const { agent } = await props.params;
  const sp = await props.searchParams;
  if (!AGENTS.includes(agent as Agent)) notFound();
  const brain = await getBrain(agent as Agent);
  const missing = missingPlaceholders(brain);
  const docs = [...brain.docs].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <p><Link href="/admin/cerveaux">← Cerveaux</Link></p>
      <h1>Cerveau · {agent}</h1>
      <Flash sp={sp} />
      {missing.length ? (
        <details className="card" style={{ borderColor: "var(--warn)" }}>
          <summary><b>{missing.length} élément(s) encore à remplir</b></summary>
          <ul className="small">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </details>
      ) : null}
      <form action={saveBrainForm}>
        <input type="hidden" name="agent" value={agent} />
        {docs.map((d) => (
          <div className="card" key={d.name}>
            <input name="doc_name" defaultValue={d.name} style={{ fontWeight: 700 }} aria-label="Nom du document" />
            <textarea name="doc_content" defaultValue={d.content} style={{ minHeight: 320, marginTop: 8 }} />
            <p className="small muted">Pour supprimer ce document, vide son nom.</p>
          </div>
        ))}
        <div className="card">
          <label htmlFor="new_name">Ajouter un document (nom)</label>
          <input id="new_name" name="new_name" placeholder="ex. 06-temoignages.md" />
        </div>
        <div className="card">
          <label htmlFor="config">Réglages (config.json)</label>
          <textarea id="config" name="config" defaultValue={JSON.stringify(brain.config, null, 2)} style={{ minHeight: 280 }} />
        </div>
        <button className="primary" type="submit">💾 Enregistrer le cerveau</button>
      </form>
    </>
  );
}
