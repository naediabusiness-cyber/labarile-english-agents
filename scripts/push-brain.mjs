#!/usr/bin/env node
/**
 * Pousse les cerveaux du dossier brains/ vers l'app.
 *   npm run brain:push              → les 4 agents
 *   npm run brain:push -- insta     → un seul agent
 * Lit APP_URL et ADMIN_PASSWORD dans .env.local (ou l'environnement).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");
const PASSWORD = process.env.ADMIN_PASSWORD ?? "";
if (!APP_URL || !PASSWORD) {
  console.error("❌ Il faut APP_URL (adresse de l'app sur Vercel) et ADMIN_PASSWORD dans .env.local");
  process.exit(1);
}

const all = ["insta", "mail", "support", "stories"];
const wanted = process.argv.slice(2).filter((a) => all.includes(a));
const agents = wanted.length ? wanted : all;

for (const agent of agents) {
  const dir = join("brains", agent);
  if (!existsSync(dir)) {
    console.warn(`⚠️  ${dir} introuvable, ignoré`);
    continue;
  }
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((name) => ({ name, content: readFileSync(join(dir, name), "utf8") }));
  let config = {};
  const cfgPath = join(dir, "config.json");
  if (existsSync(cfgPath)) {
    try {
      config = JSON.parse(readFileSync(cfgPath, "utf8"));
    } catch (e) {
      console.error(`❌ ${cfgPath} n'est pas un JSON valide : ${e.message}`);
      process.exit(1);
    }
  }
  const res = await fetch(`${APP_URL}/api/admin/brain`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-admin-password": PASSWORD },
    body: JSON.stringify({ agent, docs, config }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`❌ ${agent} : ${res.status} ${body}`);
    process.exit(1);
  }
  const holes = (JSON.stringify(docs) + JSON.stringify(config)).match(/\[À REMPLIR/g)?.length ?? 0;
  console.log(`✅ ${agent} : ${docs.length} document(s) envoyé(s)${holes ? ` · ${holes} « [À REMPLIR] » restant(s)` : " · complet"}`);
}
