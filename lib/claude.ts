import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env, requireEnv } from "./env";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY"), timeout: 120_000 });
  return client;
}

export function model(): string {
  return env("CLAUDE_MODEL") || "claude-opus-5-5";
}

export class ClaudeRefusal extends Error {}

/**
 * Un appel à Claude qui renvoie un objet validé par le schéma Zod.
 * - `system` : la partie stable (cerveau), mise en cache.
 * - `input`  : la partie variable (conversation, email…).
 * - repli automatique sur un autre modèle si la requête est refusée (fallbacks: "default").
 */
export async function decide<S extends z.ZodType>(opts: {
  system: string;
  input: string;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const res = await anthropic().beta.messages.parse({
    model: model(),
    max_tokens: opts.maxTokens ?? 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.input }],
    output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
  });
  if (res.stop_reason === "refusal") throw new ClaudeRefusal("Claude a refusé de traiter ce message.");
  if (res.stop_reason === "max_tokens") throw new Error("Réponse de Claude coupée (max_tokens).");
  if (res.parsed_output == null) throw new Error("Réponse de Claude illisible.");
  return res.parsed_output as z.infer<S>;
}

/** Message lisible pour Telegram / le journal quand l'API Anthropic échoue. */
export function claudeErrorLabel(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Clé Anthropic refusée (ANTHROPIC_API_KEY).";
  if (e instanceof Anthropic.PermissionDeniedError) return "Accès Anthropic refusé (crédits épuisés ?).";
  if (e instanceof Anthropic.RateLimitError) return "Limite Anthropic atteinte, nouvel essai au prochain tour.";
  if (e instanceof Anthropic.BadRequestError) {
    return /credit|balance/i.test(e.message) ? "Crédits Anthropic épuisés : recharger sur console.anthropic.com." : `Requête refusée : ${e.message}`;
  }
  if (e instanceof Anthropic.APIError) return `Erreur Anthropic ${e.status ?? ""} : ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
