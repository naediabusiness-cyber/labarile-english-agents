import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const pw = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");
  const expected = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (!expected || pw !== expected) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/admin";
  return (
    <div style={{ maxWidth: 360, margin: "15vh auto", padding: "0 16px" }}>
      <div className="card">
        <h1>Labarile Agents</h1>
        <form action={login}>
          <input type="hidden" name="next" value={next} />
          <label htmlFor="password">Mot de passe</label>
          <input id="password" name="password" type="password" autoFocus required />
          {sp.error ? <p className="small" style={{ color: "var(--accent)" }}>Mot de passe incorrect.</p> : null}
          <div style={{ marginTop: 14 }}>
            <button className="primary" type="submit">Entrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}
