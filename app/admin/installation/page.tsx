import { db } from "@/lib/db";
import { hasEnv, env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { getBrain } from "@/lib/brains";
import { saveAppUrl, connectTelegram, testTelegram, runTickNow } from "../actions";
import { Flash, fmt } from "../ui";

export const dynamic = "force-dynamic";

function Step({ ok, title, children }: { ok: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="row"><span>{ok ? "✅" : "⬜️"}</span><b>{title}</b></div>
      {children ? <div className="small" style={{ marginTop: 6 }}>{children}</div> : null}
    </div>
  );
}

export default async function Installation(props: PageProps<"/admin/installation">) {
  const sp = await props.searchParams;
  let dbOk = false;
  try {
    const { error } = await db().from("settings").select("key").limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }
  const appUrl = dbOk ? await getSetting<string>("app_url", "") : "";
  const webhook = dbOk ? await getSetting<string>("telegram_webhook", "") : "";
  const lastTick = dbOk ? await getSetting<{ at: string; results: string[] } | null>("last_tick", null) : null;
  const brains = dbOk ? await Promise.all((["insta", "mail", "support", "stories"] as const).map((a) => getBrain(a))) : [];
  const brainsOk = brains.length === 4 && brains.every((b) => b.docs.length > 0);

  return (
    <>
      <h1>Installation</h1>
      <Flash sp={sp} />
      <p className="muted small">Le guide complet est dans PLAYBOOK.md. Cette page coche les étapes au fur et à mesure.</p>

      <Step ok={hasEnv("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "ADMIN_PASSWORD")} title="1. Variables de base dans Vercel">
        ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
      </Step>
      <Step ok={dbOk} title="2. Tables créées dans Supabase">Supabase → SQL Editor → coller <code>supabase/install.sql</code> → Run.</Step>
      <Step ok={!!appUrl} title="3. Adresse de l'app (pour la boucle et les images)">
        <form action={saveAppUrl} className="row">
          <input name="app_url" defaultValue={appUrl} placeholder="https://labarile-agents.vercel.app (vide = adresse actuelle)" style={{ flex: 1 }} />
          <button type="submit">Enregistrer</button>
        </form>
      </Step>
      <Step ok={brainsOk} title="4. Cerveaux chargés">
        Dans le terminal : <code>npm run brain:push</code> (voir PLAYBOOK.md). {brains.map((b) => `${b.agent} : ${b.docs.length} doc(s)`).join(" · ")}
      </Step>
      <Step ok={hasEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_VALIDATION_CHAT_ID") && !!webhook} title="5. Telegram">
        <p>Variables : TELEGRAM_BOT_TOKEN, TELEGRAM_VALIDATION_CHAT_ID, TELEGRAM_SETTING_CHAT_ID. Pour connaître l&apos;id d&apos;un groupe : connecte le bot, ajoute-le au groupe et écris <code>/id</code>.</p>
        <div className="row">
          <form action={connectTelegram}><button disabled={!hasEnv("TELEGRAM_BOT_TOKEN")}>Connecter le bot</button></form>
          <form action={testTelegram}><button disabled={!webhook}>Envoyer un message test</button></form>
        </div>
        {webhook ? <p className="muted">Webhook : {webhook}</p> : null}
      </Step>
      <Step ok={hasEnv("PLUGKIT_API_KEY", "PLUGKIT_ACCOUNT_ID")} title="6. Instagram DM (PlugKit)">PLUGKIT_API_KEY et PLUGKIT_ACCOUNT_ID.</Step>
      <Step ok={hasEnv("ICLOSED_API_KEY")} title="6 bis. Créneaux des closers (iClosed, facultatif)">
        iClosed → Settings → Developers → API Keys → créer une clé, puis ICLOSED_API_KEY dans Vercel et redéployer. L&apos;agent DM propose alors les premiers créneaux libres (48 h max, à l&apos;heure du prospect) et réserve l&apos;appel quand le message part.
      </Step>
      <Step ok={hasEnv("MAIL_IMAP_HOST", "MAIL_SMTP_HOST", "MAIL_USER", "MAIL_PASSWORD")} title="7. Boîte mail commerciale">
        MAIL_IMAP_HOST, MAIL_SMTP_HOST, MAIL_USER, MAIL_PASSWORD {env("MAIL_USER") ? `(${env("MAIL_USER")})` : ""}
      </Step>
      <Step ok={hasEnv("SUPPORT_IMAP_HOST", "SUPPORT_SMTP_HOST", "SUPPORT_USER", "SUPPORT_PASSWORD")} title="8. Boîte mail support">
        SUPPORT_IMAP_HOST, SUPPORT_SMTP_HOST, SUPPORT_USER, SUPPORT_PASSWORD {env("SUPPORT_USER") ? `(${env("SUPPORT_USER")})` : ""}
      </Step>
      <Step ok={hasEnv("META_IG_USER_ID", "META_ACCESS_TOKEN")} title="9. Publication des stories (Meta)">META_IG_USER_ID et META_ACCESS_TOKEN (jeton longue durée).</Step>
      <Step ok={!!lastTick} title="10. La boucle tourne (toutes les 3 minutes)">
        {lastTick ? <>Dernier tour : {fmt(lastTick.at)}<ul>{lastTick.results.map((r, i) => <li key={i}>{r}</li>)}</ul></> : "Pas encore de tour."}
        <form action={runTickNow}><button>▶️ Lancer un tour maintenant</button></form>
      </Step>
    </>
  );
}
