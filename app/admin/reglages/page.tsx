import { getBrand, getSetting } from "@/lib/settings";
import { saveBrand, saveQuietHours } from "../actions";

export const dynamic = "force-dynamic";

const FIELDS = [
  ["name", "Nom affiché", "text"],
  ["handle", "Compte Instagram (pied de story)", "text"],
  ["primary", "Profond 05 (blocs pleins, texte)", "color"],
  ["secondary", "Profond 04", "color"],
  ["light", "Clair 01 (fonds clairs)", "color"],
  ["accent", "Couleur logo (bouton d'appel à l'action, une fois par story)", "color"],
  ["background", "Blanc (fond)", "color"],
  ["text", "Texte sur fond clair", "color"],
  ["logoUrl", "Autre logo pour fond clair (facultatif : sinon logo de la charte)", "url"],
  ["logoWhiteUrl", "Autre logo pour fond foncé (facultatif : sinon logo blanc de la charte)", "url"],
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
        <p className="small muted">Valeurs par défaut : charte graphique v2.0. Polices intégrées (Bebas Neue, Roboto, Roboto Mono). Les logos de la charte sont intégrés (couleur sur fond clair, blanc sur fond foncé) ; ne remplir les champs logo que pour en utiliser un autre.</p>
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
