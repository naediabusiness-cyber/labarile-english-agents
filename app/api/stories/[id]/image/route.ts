import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getBrand } from "@/lib/settings";
import { renderStory } from "@/lib/story-image";

export const dynamic = "force-dynamic";

/** Aperçu PNG d'une story (utilisé par Telegram et le tableau de bord). L'id est un UUID non devinable. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/stories/[id]/image">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("introuvable", { status: 404 });
  const { data: s } = await db().from("stories").select("*").eq("id", id).maybeSingle();
  if (!s) return new Response("introuvable", { status: 404 });
  return renderStory(s, await getBrand());
}
