import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { Brand } from "./settings";

/**
 * Rendu d'une story 1080×1920 selon la charte graphique Labarile English v2.0 :
 * titres en Bebas Neue (capitales), texte en Roboto Light, étiquettes en Roboto Mono,
 * rampe de bleus-gris, couleur logo réservée au bouton d'appel à l'action (une fois par écran).
 * Cinq gabarits : astuce, erreur, citation, question, appel.
 */

export type StoryContent = { template: string; title: string; body: string; cta: string | null; photo_url: string | null };

const LABEL: Record<string, string> = {
  astuce: "ASTUCE DU JOUR",
  erreur: "ERREUR FRÉQUENTE",
  citation: "PARLER AVANT DE SAVOIR",
  question: "À VOUS DE JOUER",
  appel: "ENTRETIEN OFFERT",
};

type Fonts = { name: string; data: ArrayBuffer; weight: 300 | 400 | 500; style: "normal" }[];
let fontsCache: Fonts | null = null;

async function fonts(): Promise<Fonts> {
  if (fontsCache) return fontsCache;
  const dir = join(process.cwd(), "lib", "fonts");
  const load = async (f: string) => {
    const b = await readFile(join(dir, f));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  fontsCache = [
    { name: "Bebas", data: await load("bebas-neue-400.woff"), weight: 400, style: "normal" },
    { name: "Roboto", data: await load("roboto-300.woff"), weight: 300, style: "normal" },
    { name: "Roboto", data: await load("roboto-500.woff"), weight: 500, style: "normal" },
    { name: "Mono", data: await load("roboto-mono-500.woff"), weight: 500, style: "normal" },
  ];
  return fontsCache;
}

/** Logos extraits de la charte (lib/brand) : version couleur sur fond clair, blanche sur fond foncé. */
const logoCache: Record<string, string> = {};
async function bundledLogo(dark: boolean): Promise<string> {
  const file = dark ? "logo-blanc.png" : "logo-couleur.png";
  if (!logoCache[file]) {
    const b = await readFile(join(process.cwd(), "lib", "brand", file));
    logoCache[file] = `data:image/png;base64,${b.toString("base64")}`;
  }
  return logoCache[file];
}

/** Fond et couleurs de chaque gabarit (fonds clairs : Blanc / Clair 01 ; fonds foncés : Profond 04 / 05). */
function theme(template: string, brand: Brand, hasPhoto: boolean) {
  if (hasPhoto || template === "citation" || template === "appel") return { bg: brand.primary, fg: "#ffffff", dark: true };
  if (template === "question") return { bg: brand.secondary, fg: "#ffffff", dark: true };
  if (template === "erreur") return { bg: brand.light, fg: brand.primary, dark: false };
  return { bg: brand.background, fg: brand.text, dark: false };
}

export async function renderStory(s: StoryContent, brand: Brand): Promise<ImageResponse> {
  const t = theme(s.template, brand, !!s.photo_url);
  const title = s.template === "citation" ? `« ${s.title} »` : s.title;
  const titleSize = title.length > 26 ? 150 : title.length > 16 ? 180 : 210;
  const logo = (t.dark ? brand.logoWhiteUrl : brand.logoUrl) || (await bundledLogo(t.dark));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: t.bg, color: t.fg, fontFamily: "Roboto" }}>
        {s.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.photo_url} alt="" width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1920, objectFit: "cover" }} />
        ) : null}
        {s.photo_url ? (
          // Voile de contraste (charte : jamais de logo ni de texte sur photo chargée sans voile).
          <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1920, display: "flex", backgroundImage: `linear-gradient(180deg, ${brand.primary}99 0%, ${brand.primary}cc 45%, ${brand.primary}f2 100%)` }} />
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "170px 96px 190px", position: "relative" }}>
          {/* En-tête : logo, ou « LABARILE » en Bebas + « ENGLISH » en mono */}
          <div style={{ display: "flex", alignItems: "center" }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" height={170} style={{ objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                <div style={{ fontFamily: "Bebas", fontSize: 92, letterSpacing: 4, lineHeight: 1 }}>LABARILE</div>
                <div style={{ fontFamily: "Mono", fontWeight: 500, fontSize: 30, letterSpacing: 8 }}>ENGLISH</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 40 }}>
              <div style={{ width: 64, height: 4, backgroundColor: t.fg, opacity: 0.7, display: "flex" }} />
              <div style={{ fontFamily: "Mono", fontWeight: 500, fontSize: 32, letterSpacing: 7, opacity: 0.85 }}>{LABEL[s.template] ?? "LABARILE ENGLISH"}</div>
            </div>
            <div style={{ display: "flex", fontFamily: "Bebas", fontSize: titleSize, lineHeight: 0.9, textTransform: "uppercase", marginBottom: 56 }}>{title}</div>
            {s.body ? (
              <div style={{ display: "flex", fontWeight: 300, fontSize: 54, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{s.body}</div>
            ) : null}
          </div>

          {s.cta ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                backgroundColor: brand.accent,
                color: "#1d1d1b",
                fontWeight: 500,
                fontSize: 48,
                padding: "36px 40px",
                borderRadius: 20,
                textAlign: "center",
                marginBottom: 40,
              }}
            >
              {s.cta}
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "center", fontFamily: "Mono", fontWeight: 500, fontSize: 28, letterSpacing: 6, opacity: 0.7 }}>
            {brand.handle.toUpperCase()}
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts: await fonts() },
  );
}
