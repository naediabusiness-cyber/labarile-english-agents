import { db } from "@/lib/db";
import { supportDecision, closeTicket } from "../actions";
import { Badge, fmt } from "../ui";

export const dynamic = "force-dynamic";

export default async function Support() {
  const { data: tickets } = await db().from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(100);
  const { data: mails } = await db()
    .from("emails")
    .select("ticket_id,direction,subject,body,created_at")
    .eq("mailbox", "support")
    .in("ticket_id", (tickets ?? []).map((t) => t.id))
    .order("created_at", { ascending: true });
  const byTicket = new Map<string, NonNullable<typeof mails>>();
  for (const m of mails ?? []) byTicket.set(m.ticket_id, [...(byTicket.get(m.ticket_id) ?? []), m]);

  return (
    <>
      <h1>Support</h1>
      <p className="muted small">L&apos;agent ne décide jamais seul d&apos;un remboursement : il rassemble les infos, puis tu tranches ici ou sur Telegram. Le mail de décision est toujours à valider.</p>
      {(tickets ?? []).map((t) => (
        <div className="card" key={t.id}>
          <div className="row between">
            <b>{t.name || t.email} <span className="small muted">· {t.email}</span></b>
            <div className="row"><Badge value={t.status} /><span className="small muted">{fmt(t.updated_at)}</span></div>
          </div>
          <div className="small">Catégorie : <b>{t.category ?? "?"}</b>{t.decision ? ` · décision : ${t.decision === "accorde" ? "accordée" : "refusée"}` : ""}</div>
          {t.summary ? <p className="small">{t.summary}</p> : null}
          {Object.keys(t.info ?? {}).length ? (
            <table className="small"><tbody>{Object.entries(t.info as Record<string, string>).map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody></table>
          ) : null}
          <details className="small" style={{ marginTop: 8 }}>
            <summary>Échanges ({byTicket.get(t.id)?.length ?? 0})</summary>
            {(byTicket.get(t.id) ?? []).map((m, i) => (
              <div key={i} className={`bubble ${m.direction === "in" ? "in" : "out"}`}><b>{m.subject}</b>{"\n"}{m.body}</div>
            ))}
          </details>
          {t.status !== "resolu" ? (
            <div className="row" style={{ marginTop: 10 }}>
              {t.status === "attente_decision" && !t.decision ? (
                <>
                  <form action={supportDecision}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="decision" value="accorde" /><button className="primary">✅ Accorder</button></form>
                  <form action={supportDecision}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="decision" value="refuse" /><button className="danger">❌ Refuser</button></form>
                </>
              ) : null}
              <form action={closeTicket}><input type="hidden" name="id" value={t.id} /><button>Clore le dossier</button></form>
            </div>
          ) : null}
        </div>
      ))}
      {!tickets?.length ? <p className="muted">Aucun dossier pour l&apos;instant.</p> : null}
    </>
  );
}
