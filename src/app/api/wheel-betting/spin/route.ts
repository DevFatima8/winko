import { NextResponse } from "next/server";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";

import { spin } from "@/components/wheel-betting/lib/spin-engine";
import { MIN_BET } from "@/components/wheel-betting/lib/wheel";

export const dynamic = "force-dynamic";

/** Public spectator outcome: no wager, wallet mutation, or personal result. */
export async function GET() {
  const { index, multiplier, hash } = spin(0);
  return NextResponse.json({ index, multiplier, hash }, {
    headers: { "Cache-Control": "no-store" },
  });
}

type SpinBody = {
  bet?: unknown;
  clientSeed?: unknown;
};

export async function POST(request: Request) {
  if (!LOCAL_GAMES_CONNECTED) return NextResponse.json({ error: LOCAL_GAMES_UNAVAILABLE }, { status: 403 });
  let body: SpinBody;
  try {
    body = (await request.json()) as SpinBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const bet = Number(body.bet);
  if (!Number.isFinite(bet) || Number.isNaN(bet)) {
    return NextResponse.json({ error: "Bet amount must be a number." }, { status: 400 });
  }
  if (bet < MIN_BET) {
    return NextResponse.json({ error: `Minimum bet is ${MIN_BET}.` }, { status: 400 });
  }

  const clientSeed = typeof body.clientSeed === "string" ? body.clientSeed : undefined;
  const result = spin(Math.round(bet * 100) / 100, clientSeed);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
