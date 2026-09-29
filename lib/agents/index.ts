import { logEvent } from "../db";
import { runInsta } from "./insta";
import { runMail } from "./mail";
import { runSupport } from "./support";
import { runStories } from "./stories";

/** Un tour de boucle : chaque agent tourne indépendamment (l'échec de l'un ne bloque pas les autres). */
export async function tick(): Promise<string[]> {
  const jobs: [string, () => Promise<string>][] = [
    ["mail", runMail],
    ["support", runSupport],
    ["insta", runInsta],
    ["stories", runStories],
  ];
  const results = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  const out: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const name = jobs[i][0];
    if (r.status === "fulfilled") out.push(r.value);
    else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      out.push(`${name} : erreur (${msg})`);
      await logEvent(name as "mail", `Erreur : ${msg}`, "error");
    }
  }
  return out;
}
