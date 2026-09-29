import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, fmt } from "../ui";

export const dynamic = "force-dynamic";

export default async function Instagram(props: PageProps<"/admin/instagram">) {
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  let q = db().from("ig_conversations").select("*").order("updated_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  const filters = [["", "Toutes"], ["bot", "Agent"], ["human", "Luc"], ["booked", "RDV"], ["lost", "Perdues"], ["out", "Hors cible"]];
  return (
    <>
      <h1>Instagram</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        {filters.map(([v, l]) => (
          <Link key={v} href={v ? `/admin/instagram?status=${v}` : "/admin/instagram"} className={`btn ${status === v ? "primary" : ""}`}>{l}</Link>
        ))}
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Contact</th><th>Qui a la main</th><th>Étape</th><th>Résumé</th><th>Activité</th></tr></thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id}>
                <td><Link href={`/admin/instagram/${c.id}`}>{c.name ?? c.id}</Link></td>
                <td><Badge value={c.status} /></td>
                <td className="small">{c.stage}</td>
                <td className="small muted">{c.summary ?? ""}</td>
                <td className="small muted" style={{ whiteSpace: "nowrap" }}>{fmt(c.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length ? <p className="muted">Aucune conversation pour l&apos;instant.</p> : null}
      </div>
    </>
  );
}
