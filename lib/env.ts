/** Lecture des variables d'environnement (côté serveur uniquement). */

export function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return v;
}

export function hasEnv(...names: string[]): boolean {
  return names.every((n) => env(n) !== "");
}
