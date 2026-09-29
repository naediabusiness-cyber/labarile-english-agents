import Link from "next/link";
import { logout } from "./actions";

const LINKS = [
  ["/admin", "Vue d'ensemble"],
  ["/admin/brouillons", "📝 À valider"],
  ["/admin/instagram", "📸 Instagram"],
  ["/admin/mails", "✉️ Mails & setting"],
  ["/admin/support", "🛟 Support"],
  ["/admin/stories", "🎨 Stories"],
  ["/admin/cerveaux", "🧠 Cerveaux"],
  ["/admin/reglages", "⚙️ Réglages"],
  ["/admin/installation", "🔧 Installation"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <nav className="nav">
        <div className="logo">Labarile Agents</div>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
        <form action={logout} style={{ marginTop: 12 }}>
          <button type="submit" className="small">Se déconnecter</button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
