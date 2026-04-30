import { NextRequest } from "next/server";
import { cases } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ cases: cases.list() });
}

export async function POST(req: NextRequest) {
  // Override
  const { id, verdict, notes } = await req.json();
  if (!id || !verdict || !["APPROVE", "DECLINE"].includes(verdict)) {
    return new Response("Bad request", { status: 400 });
  }
  const c = cases.override(id, verdict, notes ?? "");
  if (!c) return new Response("Not found", { status: 404 });
  return Response.json({ case: c });
}
