import { db } from "@/lib/db";
import { draftAction } from "../actions";
import { Flash, fmt } from "../ui";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { insta: "📸 Instagram", mail: "✉️ Mail", support: "🛟 Support" };

export default async function Drafts(props: PageProps<"/admin/brouillons">) {
  const sp = await props.searchParams;
  const { data } = await db().from("drafts").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(50);
  const drafts = data ?? [];

  // Contexte : nom du contact et dernier message reçu.
  const igIds = drafts.filter((d) => d.channel === "insta").map((d) => d.ref_id);
  const mailIds = drafts.filter((d) => d.channel !== "insta").map((d) => d.ref_id);
  const [convs, mails] = await Promise.all([
    igIds.length ? db().from("ig_conversations").select("id,name,summary").in("id", igIds) : Promise.resolve({ data: [] as { id: string; name: string; summary: string }[] }),
    mailIds.length ? db().from("emails").select("id,from_name,from_email,subject,body").in("id", mailIds) : Promise.resolve({ data: [] as { id: string; from_name: string; from_email: string; subject: string; body: string }[] }),
  ]);
  const convMap = new Map((convs.data ?? []).map((c) => [c.id, c]));
  const mailMap = new Map((mails.data ?? []).map((m) => [m.id, m]));

  return (
    <>
      <h1>À valider</h1>
      <Flash sp={sp} />
      {drafts.length === 0 ? <p className="muted">Rien en attente 🎉</p> : null}
      {drafts.map((d) => {
        const c = convMap.get(d.ref_id);
        const m = mailMap.get(d.ref_id);
        return (
          <div className="card" key={d.id}>
            <div className="row between">
              <b>{LABEL[d.channel]} · {c?.name ?? m?.from_name ?? m?.from_email ?? ""}</b>
              <span className="small muted">{fmt(d.created_at)}</span>
            </div>
            {m ? <div className="small muted">{m.subject}</div> : null}
            {c?.summary ? <div className="small muted">{c.summary}</div> : null}
            {d.meta?.reason ? <div className="small" style={{ marginTop: 6 }}><i>{String(d.meta.reason)}</i></div> : null}
            {m ? <details className="small" style={{ marginTop: 8 }}><summary>Mail reçu</summary><div className="pre">{m.body}</div></details> : null}
            {d.meta?.phoneOnly ? <p className="small" style={{ color: "var(--warn)" }}>⚠️ Hors fenêtre 24 h : à copier et envoyer depuis le téléphone.</p> : null}
            <form action={draftAction}>
              <input type="hidden" name="id" value={d.id} />
              <textarea name="content" defaultValue={d.content} style={{ fontFamily: "inherit", fontSize: 14, marginTop: 8 }} />
              <div className="row" style={{ marginTop: 8 }}>
                {!d.meta?.phoneOnly ? <button className="primary" name="action" value="send">✅ Envoyer</button> : null}
                <button name="action" value="save">💾 Enregistrer</button>
                <button className="danger" name="action" value="drop">🗑 Ignorer</button>
              </div>
            </form>
          </div>
        );
      })}
    </>
  );
}
