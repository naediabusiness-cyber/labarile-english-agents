import { getBrand, getSetting } from "@/lib/settings";
import { saveBrand, saveQuietHours } from "../actions";

export const dynamic = "force-dynamic";

const FIELDS = [
  ["name", "Nom affiché", "text"],
  ["primary", "Couleur principale", "color"],
  ["secondary", "Couleur secondaire", "color"],
  ["accent", "Couleur d'accent (boutons, CTA)", "color"],
  ["background", "Fond des stories", "color"],
  ["text", "Couleur du texte", "color"],
  ["logoUrl", "Logo (URL d'un PNG, idéalement fond transparent)", "url"],
  ["fontUrl", "Police (URL d'un fichier .ttf ou .otf)", "url"],
] as const;

export default async function Settings() {
  const brand = await getBrand();
  const quiet = await getSetting<{ start: string; end: string }>("quiet_hours", { start: "22:00", end: "08:00" });
  return (
    <>
      <h1>Réglages</h1>
      <h2>🎨 Identité graphique (stories)</h2>
      <form action={saveBrand} className="card">
        {FIELDS.map(([k, label, type]) => (
          <div key={k}>
            <label htmlFor={k}>{label}</label>
            <input id={k} name={k} type={type} defaultValue={brand[k]} style={type === "color" ? { width: 90, height: 40, padding: 2 } : undefined} />
          </div>
        ))}
        <p className="small muted">Astuce : dépose le logo et la police dans la section Photos de la page Stories (ou dans Supabase → Storage → photos) et colle ici leur adresse publique.</p>
        <button className="primary" type="submit" style={{ marginTop: 10 }}>Enregistrer</button>
      </form>

      <h2>🌙 Heures de silence (Instagram en automatique)</h2>
      <form action={saveQuietHours} className="card row">
        <label htmlFor="start" style={{ margin: 0 }}>De</label>
        <input id="start" name="start" type="time" defaultValue={quiet.start} style={{ width: 130 }} />
        <label htmlFor="end" style={{ margin: 0 }}>à</label>
        <input id="end" name="end" type="time" defaultValue={quiet.end} style={{ width: 130 }} />
        <button type="submit">Enregistrer</button>
      </form>
      <p className="small muted">Pendant ces heures (heure de Paris), l&apos;agent Instagram n&apos;envoie rien seul : il prépare des brouillons.</p>
    </>
  );
}
