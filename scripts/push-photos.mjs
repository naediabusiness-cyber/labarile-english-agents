#!/usr/bin/env node
/**
 * Envoie un dossier de photos dans la banque d'images des stories (Supabase → Storage → photos).
 * Chaque photo est recadrée au format story (1080×1920) et compressée.
 *   npm run photos:push -- ~/Downloads/Photos-Labarile
 * Lit SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local (ou l'environnement).
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌ Il faut SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local");
  process.exit(1);
}
const dir = process.argv[2];
if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error("❌ Donne le dossier des photos : npm run photos:push -- /chemin/du/dossier");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: existing } = await supabase.storage.from("photos").list("", { limit: 1000 });
const already = new Set((existing ?? []).map((f) => f.name));

const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
let sent = 0;
for (const f of files) {
  const name = `${basename(f, extname(f)).replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`;
  if (already.has(name)) {
    console.log(`= ${name} déjà présente`);
    continue;
  }
  try {
    const jpeg = await sharp(join(dir, f)).rotate().resize(1080, 1920, { fit: "cover", position: "attention" }).jpeg({ quality: 85 }).toBuffer();
    const { error } = await supabase.storage.from("photos").upload(name, jpeg, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
    sent++;
    console.log(`✅ ${name} (${Math.round(jpeg.length / 1024)} Ko)`);
  } catch (e) {
    console.error(`❌ ${f} : ${e.message}`);
  }
}
console.log(`\n${sent} photo(s) envoyée(s) sur ${files.length}.`);
