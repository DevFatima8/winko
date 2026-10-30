import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { DAILY_POOL_GAMES } from "@/lib/dailyPoolRules";
import { processDailyPool } from "@/lib/dailyPoolService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.DAILY_POOL_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Daily-pool scheduler is not configured." }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const failed: string[] = [];
  for (const game of DAILY_POOL_GAMES) {
    try { await processDailyPool(game); }
    catch (error) { failed.push(game); console.error("[daily pool scheduler]", game, error); }
  }
  if (failed.length) return NextResponse.json({ error: "Settlement incomplete. Retry safely; committed settlements are not paid twice.", failed }, { status: 503 });
  return NextResponse.json({ ok: true });
}
