import { db, type Agent } from "./db";

export type BrainDoc = { name: string; content: string };
export type Brain = { agent: Agent; docs: BrainDoc[]; config: Record<string, unknown>; updated_at?: string };

export const PLACEHOLDER = "[À REMPLIR";

export async function getBrain(agent: Agent): Promise<Brain> {
  const { data } = await db().from("brains").select("*").eq("agent", agent).maybeSingle();
  return (data as Brain) ?? { agent, docs: [], config: {} };
}

export async function saveBrain(agent: Agent, docs: BrainDoc[], config: Record<string, unknown>) {
  const { error } = await db()
    .from("brains")
    .upsert({ agent, docs, config, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Les trous encore à remplir (un agent ne passe pas en automatique tant qu'il en reste). */
export function missingPlaceholders(brain: Brain): string[] {
  const found = new Set<string>();
  const scan = (text: string, where: string) => {
    const re = /\[À REMPLIR[^\]]*\]/g;
    for (const m of text.matchAll(re)) found.add(`${where} : ${m[0]}`);
  };
  for (const d of brain.docs) scan(d.content, d.name);
  scan(JSON.stringify(brain.config), "config.json");
  return [...found];
}

/** Le cerveau mis en forme pour le prompt système (stable → mis en cache). */
export function brainAsPrompt(brain: Brain): string {
  const docs = [...brain.docs]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => `<document nom="${d.name}">\n${d.content.trim()}\n</document>`)
    .join("\n\n");
  return `${docs}\n\n<reglages>\n${JSON.stringify(brain.config, null, 2)}\n</reglages>`;
}

export function configValue<T>(brain: Brain, key: string, fallback: T): T {
  const v = brain.config[key];
  return (v as T) ?? fallback;
}
