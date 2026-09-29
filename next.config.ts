import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // imapflow / mailparser / sharp tournent côté serveur Node, sans bundling.
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", "sharp"],
  // Les polices et logos des stories sont lus sur le disque : les embarquer dans toutes les fonctions.
  outputFileTracingIncludes: { "/**": ["./lib/fonts/**/*", "./lib/brand/*.png"] },
  // Envoi de photos depuis le tableau de bord (Vercel plafonne de toute façon à ~4,5 Mo) :
  // pour les grosses photos, utiliser npm run photos:push.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
