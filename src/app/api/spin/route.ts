import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";
import { getServerSessionUser } from "@/lib/serverAuth";
import { mysqlMultiplayerStore } from "@/lib/multiplayer-store";
import { dailyPoolLock } from "@/lib/dailyPoolRules";
import { resolveBirdsBeastsRound } from "@/lib/birdsBeastsRounds";

export const dynamic = "force-dynamic";

/** Idle rounds share the paid round schedule, but never settle stakes or credit a wallet. */
export async function POST(req: Request) {
  if (!LOCAL_GAMES_CONNECTED) return NextResponse.json({ error: LOCAL_GAMES_UNAVAILABLE }, { status: 403 });
  const me = await getServerSessionUser();
  if (!me) return NextResponse.json({ error: "Login required." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid round request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("roundId" in body) ||
      typeof body.roundId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(body.roundId) ||
      ("bets" in body && (!body.bets || typeof body.bets !== "object" || Object.keys(body.bets).length))) {
    return NextResponse.json({ error: "Only an identified idle round is accepted here." }, { status: 400 });
  }
  const id = createHash("sha256").update(`birds-beasts:idle:${me.id}:${body.roundId}`).digest("hex");
  try {
    const outcome = await mysqlMultiplayerStore.transact(dailyPoolLock("birds-beasts"), async tx => {
      const saved = await tx.get<{ outcome: { slot: number; animal: string; outcome: string } }>("multiplayerrequests", id);
      if (saved) return saved.outcome;
      const { outcome } = await resolveBirdsBeastsRound(tx, {});
      await tx.put("multiplayerrequests", id, { _id: id, outcome });
      return outcome;
    });
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("[birds-beasts idle round]", error);
    return NextResponse.json({ error: "Round result unavailable. Retry with the same round ID." }, { status: 500 });
  }
}
