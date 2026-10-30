import { randomInt } from "crypto";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";
import { NextResponse } from "next/server";
import { decideOutcome } from "@/components/birds-beasts/lib/engine";
import { ANIMALS, WHEEL, isBetKey, type Bets } from "@/components/birds-beasts/lib/game-config";

export const dynamic = "force-dynamic";

/** Cryptographically seeded uniform float in [0, 1) */
const secureRandom = () => randomInt(0, 2 ** 31) / 2 ** 31;

export async function POST(req: Request) {
  if (!LOCAL_GAMES_CONNECTED) return NextResponse.json({ error: LOCAL_GAMES_UNAVAILABLE }, { status: 403 });
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const rawBets =
    body && typeof body === "object" && "bets" in body ? (body as { bets?: unknown }).bets : undefined;

  const bets: Bets = {};
  if (rawBets && typeof rawBets === "object") {
    for (const [key, value] of Object.entries(rawBets as Record<string, unknown>)) {
      if (isBetKey(key) && typeof value === "number" && Number.isFinite(value) && value > 0) {
        bets[key] = value;
      }
    }
  }

  const decision = decideOutcome(bets, secureRandom);

  return NextResponse.json({
    slot: decision.slot,
    animal: ANIMALS[WHEEL[decision.slot]].id,
    outcome: decision.outcome,
  });
}
