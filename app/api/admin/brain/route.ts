import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidAdminHeader, isValidSession } from "@/lib/auth";
import { getBrain, saveBrain, type BrainDoc } from "@/lib/brains";
import type { Agent } from "@/lib/db";

export const dynamic = "force-dynamic";

const AGENTS: Agent[] = ["insta", "mail", "support", "stories"];

async function authorized(request: NextRequest) {
  if (isValidAdminHeader(request.headers.get("x-admin-password"))) return true;
  return isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** GET ?agent=insta → le cerveau ; PUT { agent, docs, config } → remplace (utilisé par npm run brain:push). */
export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const agent = request.nextUrl.searchParams.get("agent") as Agent;
  if (!AGENTS.includes(agent)) return NextResponse.json({ error: "agent inconnu" }, { status: 400 });
  return NextResponse.json(await getBrain(agent));
}

export async function PUT(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const body = (await request.json()) as { agent: Agent; docs: BrainDoc[]; config: Record<string, unknown> };
  if (!AGENTS.includes(body.agent)) return NextResponse.json({ error: "agent inconnu" }, { status: 400 });
  if (!Array.isArray(body.docs) || typeof body.config !== "object") return NextResponse.json({ error: "format invalide" }, { status: 400 });
  await saveBrain(body.agent, body.docs, body.config);
  return NextResponse.json({ ok: true, docs: body.docs.length });
}
