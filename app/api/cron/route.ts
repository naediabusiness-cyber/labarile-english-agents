import { NextResponse, after, type NextRequest } from "next/server";
import { tick } from "@/lib/agents";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Appelé toutes les 3 minutes par Supabase (pg_cron → labarile_tick).
 * On répond tout de suite, le tour tourne ensuite (after) jusqu'à 5 minutes.
 */
export async function POST(request: NextRequest) {
  const secret = await getSetting<string>("cron_secret", "");
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  // Évite deux tours en parallèle si un tour dépasse 3 minutes.
  const running = await getSetting<number>("tick_running_since", 0);
  if (running && Date.now() - running < 5 * 60_000) return NextResponse.json({ skipped: "tour précédent en cours" });
  await setSetting("tick_running_since", Date.now());
  after(async () => {
    try {
      const results = await tick();
      await setSetting("last_tick", { at: new Date().toISOString(), results });
    } finally {
      await setSetting("tick_running_since", 0);
    }
  });
  return NextResponse.json({ ok: true, started: true });
}
