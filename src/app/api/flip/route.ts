import { randomInt } from "node:crypto";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";
import { MIN_BET, WIN_CHANCE, isSide, otherSide, type FlipResponse } from "@/components/head-tail/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!LOCAL_GAMES_CONNECTED) return Response.json({ error: LOCAL_GAMES_UNAVAILABLE }, { status: 403 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid bet." }, { status: 400 });
  }
  const { choice, amount } = (input ?? {}) as { choice?: unknown; amount?: unknown };
  if (!isSide(choice) || typeof amount !== "number" || !Number.isFinite(amount) || amount < MIN_BET) {
    return Response.json({ error: "Invalid bet." }, { status: 400 });
  }

  const win = randomInt(1000) < WIN_CHANCE * 1000;
  const body: FlipResponse = { win, result: win ? choice : otherSide(choice) };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
