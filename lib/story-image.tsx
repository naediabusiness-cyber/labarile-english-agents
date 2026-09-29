import { ImageResponse } from "next/og";
import type { Brand } from "./settings";

/**
 * Rendu d'une story 1080×1920 aux couleurs de Labarile (réglages → identité graphique).
 * Cinq gabarits : astuce, erreur, citation, question, appel.
 */

export type StoryContent = { template: string; title: string; body: string; cta: string | null; photo_url: string | null };

const CHIP: Record<string, string> = {
  astuce: "ASTUCE DU JOUR",
  erreur: "ERREUR FRÉQUENTE",
  citation: "MOTIVATION",
  question: "À TOI DE JOUER",
  appel: "PARLONS-EN",
};

async function loadFont(url: string): Promise<ArrayBuffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function renderStory(s: StoryContent, brand: Brand): Promise<ImageResponse> {
  const font = await loadFont(brand.fontUrl);
  const dark = !!s.photo_url || s.template === "appel";
  const fg = dark ? "#FFFFFF" : brand.text;
  const bg = s.template === "appel" ? brand.primary : brand.background;
  const titleSize = s.title.length > 28 ? 92 : 112;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          backgroundColor: bg,
          color: fg,
          fontFamily: font ? "Brand" : "sans-serif",
        }}
      >
        {s.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.photo_url} alt="" width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />
        ) : null}
        {s.photo_url ? (
          <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1920, backgroundColor: "rgba(0,0,0,0.55)", display: "flex" }} />
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "180px 90px 220px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="" height={90} style={{ objectFit: "contain" }} />
            ) : (
              <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 2 }}>{brand.name.toUpperCase()}</div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                backgroundColor: s.template === "erreur" ? brand.accent : dark ? "rgba(255,255,255,0.15)" : brand.primary,
                color: "#FFFFFF",
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: 3,
                padding: "14px 30px",
                borderRadius: 999,
                marginBottom: 56,
              }}
            >
              {CHIP[s.template] ?? "LABARILE ENGLISH"}
            </div>
            <div style={{ display: "flex", fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, marginBottom: 56 }}>
              {s.template === "citation" ? `« ${s.title} »` : s.title}
            </div>
            {s.body ? (
              <div style={{ display: "flex", fontSize: 54, lineHeight: 1.35, opacity: 0.92, whiteSpace: "pre-wrap" }}>{s.body}</div>
            ) : null}
          </div>

          {s.cta ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                backgroundColor: brand.accent,
                color: "#FFFFFF",
                fontSize: 50,
                fontWeight: 700,
                padding: "34px 40px",
                borderRadius: 28,
                textAlign: "center",
              }}
            >
              {s.cta}
            </div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      ...(font ? { fonts: [{ name: "Brand", data: font, style: "normal" as const, weight: 700 as const }] } : {}),
    },
  );
}
