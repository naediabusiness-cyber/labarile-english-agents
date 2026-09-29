import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let client: SupabaseClient | null = null;

/** Client Supabase avec la clé service_role : serveur uniquement. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  }
  return client;
}

export type Agent = "insta" | "mail" | "support" | "stories";

export async function logEvent(agent: Agent | "system", message: string, level: "info" | "warn" | "error" = "info") {
  try {
    await db().from("events").insert({ agent, message: message.slice(0, 2000), level });
  } catch {
    /* le journal ne doit jamais faire tomber un agent */
  }
}
