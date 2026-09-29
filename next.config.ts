import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // imapflow / mailparser / sharp tournent côté serveur Node, sans bundling.
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", "sharp"],
};

export default nextConfig;
