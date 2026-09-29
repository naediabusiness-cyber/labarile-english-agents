import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Labarile Agents",
  description: "Agents IA de Labarile English : Instagram, mails, support.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
