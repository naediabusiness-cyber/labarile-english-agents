import { db } from "@/lib/db";
import { prettyPhone } from "@/lib/phone";
import { markCalled } from "../actions";
import { Badge, fmt } from "../ui";

export const dynamic = "force-dynamic";

export default async function Mails() {
  const [{ data: alerts }, { data: mails }] = await Promise.all([
    db().from("setting_alerts").select("*").order("created_at", { ascending: false }).limit(50),
    db().from("emails").select("id,from_name,from_email,subject,category,status,phones,created_at,direction").eq("mailbox", "mail").order("created_at", { ascending: false }).limit(100),
  ]);
  return (
    <>
      <h1>Mails &amp; setting</h1>
      <h2>📞 Numéros à rappeler</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Contact</th><th>Numéro</th><th>Reçu</th><th>Qui</th><th></th></tr></thead>
          <tbody>
            {(alerts ?? []).map((a) => (
              <tr key={a.id}>
                <td>{a.name}<div className="small muted">{(a.context ?? "").slice(0, 120)}</div></td>
                <td style={{ whiteSpace: "nowrap" }}><a href={`tel:${a.phone}`}>{prettyPhone(a.phone)}</a></td>
                <td className="small muted">{fmt(a.created_at)}</td>
                <td className="small">{a.done_at ? `✅ ${a.claimed_by ?? ""}` : a.claimed_by ? `✋ ${a.claimed_by}` : "—"}</td>
                <td>{!a.done_at ? <form action={markCalled}><input type="hidden" name="id" value={a.id} /><button>Appelé</button></form> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!alerts?.length ? <p className="muted">Aucun numéro détecté pour l&apos;instant.</p> : null}
      </div>

      <h2>✉️ Boîte commerciale</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>De / à</th><th>Objet</th><th>Catégorie</th><th>Statut</th><th>Date</th></tr></thead>
          <tbody>
            {(mails ?? []).map((m) => (
              <tr key={m.id}>
                <td>{m.direction === "out" ? "→ " : ""}{m.from_name || m.from_email}<div className="small muted">{m.from_email}</div></td>
                <td className="small">{m.subject}{m.phones?.length ? " 📞" : ""}</td>
                <td className="small">{m.category ?? ""}</td>
                <td><Badge value={m.status} /></td>
                <td className="small muted" style={{ whiteSpace: "nowrap" }}>{fmt(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
