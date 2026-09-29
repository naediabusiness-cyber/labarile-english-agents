import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { setConversationStatus } from "../../actions";
import { Badge, fmt } from "../../ui";

export const dynamic = "force-dynamic";

export default async function Conversation(props: PageProps<"/admin/instagram/[id]">) {
  const { id } = await props.params;
  const { data: c } = await db().from("ig_conversations").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const { data: msgs } = await db().from("ig_messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(300);
  const statuses = [["bot", "🤖 Confier à l'agent"], ["human", "🙋 Je reprends"], ["booked", "📅 RDV pris"], ["lost", "Perdu"], ["out", "Hors cible"]];
  return (
    <>
      <p><Link href="/admin/instagram">← Instagram</Link></p>
      <h1>{c.name}</h1>
      <div className="card">
        <div className="row"><Badge value={c.status} /><span className="small">Étape : <b>{c.stage}</b></span><span className="small muted">Relances : {c.follow_ups}</span></div>
        {c.summary ? <p className="small">{c.summary}</p> : null}
        {Object.keys(c.fields ?? {}).length ? (
          <table className="small"><tbody>{Object.entries(c.fields as Record<string, string>).map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody></table>
        ) : null}
        <div className="row" style={{ marginTop: 10 }}>
          {statuses.map(([s, l]) => (
            <form action={setConversationStatus} key={s}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="status" value={s} />
              <button type="submit" className={c.status === s ? "primary" : ""}>{l}</button>
            </form>
          ))}
        </div>
      </div>
      <div className="card">
        {(msgs ?? []).map((m) => (
          <div key={m.id} className={`bubble ${m.direction === "incoming" ? "in" : "out"}`}>
            {m.text}
            <div className="small" style={{ opacity: 0.6, marginTop: 4 }}>{fmt(m.created_at)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
