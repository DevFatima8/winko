import { randomInt, randomUUID } from "node:crypto";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";
import { WIN_CHANCE, roundMoney, type Bet, type Side } from "@/components/tai-xiu-game/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!LOCAL_GAMES_CONNECTED) return Response.json({ error: LOCAL_GAMES_UNAVAILABLE }, { status: 403 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Please send a valid bet." }, { status: 400 });
  }
  if (!input || typeof input !== "object") {
    return Response.json({ error: "Please send a valid bet." }, { status: 400 });
  }
  const { side, stake } = input as { side?: unknown; stake?: unknown };
  if ((side !== "tai" && side !== "xiu") || typeof stake !== "number" || !Number.isFinite(stake) || stake < 1 || Math.abs(roundMoney(stake) - stake) > 0.000001) {
    return Response.json({ error: "Choose a side and a stake of at least 1 coin (up to two decimal places)." }, { status: 400 });
  }

  const won = randomInt(100) < WIN_CHANCE;
  const resultSide: Side = won ? side : side === "tai" ? "xiu" : "tai";
  let dice: [number, number, number];
  let total: number;
  do {
    dice = [randomInt(1, 7), randomInt(1, 7), randomInt(1, 7)];
    total = dice[0] + dice[1] + dice[2];
  } while (
    (dice[0] === dice[1] && dice[1] === dice[2]) ||
    (resultSide === "tai" ? total < 11 || total > 17 : total < 4 || total > 10)
  );

  const result: Bet = {
    id: randomUUID().slice(0, 8).toUpperCase(),
    createdAt: new Date().toISOString(),
    prediction: side,
    side: resultSide,
    dice,
    total,
    won,
    stake,
    payout: won ? roundMoney(stake * 2) : 0,
  };
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
