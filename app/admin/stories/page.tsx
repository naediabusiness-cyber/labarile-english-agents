import { db } from "@/lib/db";
import { generateStoriesNow, storyAction, uploadPhoto, deletePhoto } from "../actions";
import { Badge, Flash, fmt } from "../ui";

export const dynamic = "force-dynamic";

export default async function Stories(props: PageProps<"/admin/stories">) {
  const sp = await props.searchParams;
  const { data: stories } = await db().from("stories").select("*").neq("status", "rejected").order("scheduled_for", { ascending: false }).limit(40);
  const { data: photos } = await db().storage.from("photos").list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  const photoFiles = (photos ?? []).filter((p) => /\.(jpe?g|png|webp)$/i.test(p.name));

  return (
    <>
      <h1>Stories</h1>
      <Flash sp={sp} />
      <div className="card">
        <b>Créer maintenant</b>
        <form action={generateStoriesNow} className="row" style={{ marginTop: 8 }}>
          <input name="count" type="number" min={1} max={5} defaultValue={1} style={{ width: 80 }} aria-label="Nombre" />
          <input name="time" type="time" style={{ width: 130 }} aria-label="Heure de publication" />
          <input name="hint" placeholder="Consigne (facultatif) : ex. une astuce sur le present perfect" style={{ flex: 1, minWidth: 220 }} />
          <button className="primary" type="submit">✨ Générer</button>
        </form>
        <p className="small muted">Chaque matin à 7 h, l&apos;agent prépare aussi les stories du jour et te les envoie sur Telegram.</p>
      </div>

      <div className="stories">
        {(stories ?? []).map((s) => (
          <div className="card" key={s.id} style={{ padding: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/stories/${s.id}/image?v=${encodeURIComponent(s.title)}`} alt={s.title} loading="lazy" />
            <div className="row between" style={{ marginTop: 8 }}><Badge value={s.status} /><span className="small muted">{fmt(s.scheduled_for)}</span></div>
            {s.error ? <p className="small" style={{ color: "var(--accent)" }}>{s.error}</p> : null}
            {s.status === "draft" || s.status === "approved" || s.status === "failed" ? (
              <details className="small" style={{ marginTop: 6 }}>
                <summary>Modifier</summary>
                <form action={storyAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input name="title" defaultValue={s.title} aria-label="Titre" />
                  <textarea name="body" defaultValue={s.body} style={{ minHeight: 70, fontFamily: "inherit" }} aria-label="Texte" />
                  <input name="cta" defaultValue={s.cta ?? ""} aria-label="Appel à l'action" />
                  <button name="action" value="save" style={{ marginTop: 6 }}>💾 Enregistrer</button>
                </form>
              </details>
            ) : null}
            <form action={storyAction} className="row" style={{ marginTop: 6 }}>
              <input type="hidden" name="id" value={s.id} />
              {s.status === "draft" ? <button className="primary small" name="action" value="approve">✅ Programmer</button> : null}
              {s.status !== "published" ? <button className="small" name="action" value="publish">🚀 Publier</button> : null}
              {s.status !== "published" ? <button className="danger small" name="action" value="reject">❌</button> : null}
            </form>
          </div>
        ))}
      </div>

      <h2>📷 Photos de Labarile</h2>
      <div className="card">
        <p className="small muted">Les gabarits « citation » et « appel » utilisent une de ces photos en fond (au hasard).</p>
        <form action={uploadPhoto} className="row">
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" style={{ flex: 1 }} />
          <button type="submit">Ajouter</button>
        </form>
        <div className="stories" style={{ marginTop: 12 }}>
          {photoFiles.map((p) => (
            <div key={p.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={db().storage.from("photos").getPublicUrl(p.name).data.publicUrl} alt="" loading="lazy" />
              <form action={deletePhoto}><input type="hidden" name="name" value={p.name} /><button className="danger small" style={{ marginTop: 4 }}>Supprimer</button></form>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
