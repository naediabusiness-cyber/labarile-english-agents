import Link from "next/link";
import { db, type Agent } from "@/lib/db";
import { getModes, getSetting } from "@/lib/settings";
import { setMode } from "./actions";
import { Badge, Flash, fmt } from "./ui";

export const dynamic = "force-dynamic";

const AGENTS: [Agent, string, string][] = [
  ["insta", "📸 Instagram DM", "Répond aux DM et amène vers l'appel"],
  ["mail", "✉️ Mails", "Répond aux mails, numéros → équipe setting"],
  ["support", "🛟 Support", "Réclamations, remboursements, annulations"],
  ["stories", "🎨 Stories", "Prépare et publie les stories du jour"],
];

export default async function Overview(props: PageProps<"/admin">) {
  const sp = await props.searchParams;
  const modes = await getModes();
  const lastTick = await getSetting<{ at: string; results: string[] } | null>("last_tick", null);
  const [drafts, calls, decisions, events] = await Promise.all([
    db().from("drafts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db().from("setting_alerts").select("id", { count: "exact", head: true }).is("done_at", null),
    db().from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "attente_decision"),
    db().from("events").select("*").order("created_at", { ascending: false }).limit(25),
  ]);

  return (
    <>
      <h1>Vue d&apos;ensemble</h1>
      <Flash sp={sp} />
      <div className="grid">
        <Link href="/admin/brouillons" className="card"><div className="muted small">À valider</div><div style={{ fontSize: 28, fontWeight: 800 }}>{drafts.count ?? 0}</div></Link>
        <Link href="/admin/mails" className="card"><div className="muted small">Numéros à rappeler</div><div style={{ fontSize: 28, fontWeight: 800 }}>{calls.count ?? 0}</div></Link>
        <Link href="/admin/support" className="card"><div className="muted small">Décisions support</div><div style={{ fontSize: 28, fontWeight: 800 }}>{decisions.count ?? 0}</div></Link>
      </div>

      <h2>Les agents</h2>
      <div className="grid">
        {AGENTS.map(([id, name, desc]) => (
          <div className="card" key={id}>
            <div className="row between"><b>{name}</b><Badge value={modes[id]} /></div>
            <p className="muted small">{desc}</p>
            <div className="row">
              {(["off", "supervised", "auto"] as const).map((m) => (
                <form action={setMode} key={m}>
                  <input type="hidden" name="agent" value={id} />
                  <input type="hidden" name="mode" value={m} />
                  <button type="submit" className={modes[id] === m ? "primary" : ""}>{m === "off" ? "Couper" : m === "auto" ? "Auto" : "Supervisé"}</button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="small muted">
        Supervisé : tout passe par un clic (Telegram ou « À valider »). Auto : l&apos;agent envoie seul ; les remboursements, escalades et messages hors fenêtre 24 h restent toujours humains.
      </p>

      <h2>Dernier tour de boucle</h2>
      <div className="card small">
        {lastTick ? (<><div className="muted">{fmt(lastTick.at)}</div><ul>{lastTick.results.map((r, i) => <li key={i}>{r}</li>)}</ul></>) : <span className="muted">Pas encore de tour (voir Installation).</span>}
      </div>

      <h2>Journal</h2>
      <div className="card table-wrap">
        <table>
          <tbody>
            {(events.data ?? []).map((e) => (
              <tr key={e.id}>
                <td className="small muted" style={{ whiteSpace: "nowrap" }}>{fmt(e.created_at)}</td>
                <td className="small">{e.agent}</td>
                <td className="small" style={{ color: e.level === "error" ? "var(--accent)" : undefined }}>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
