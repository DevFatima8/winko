import { NextResponse } from "next/server";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";
import { getServerSessionUser } from "@/lib/serverAuth";
import { multiplayer } from "@/lib/multiplayer";

export const dynamic = "force-dynamic";

/** Legacy spectators read the same live result; request IDs never create extra table rounds. */
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
  try {
    const state = await multiplayer.read("birds-beasts");
    if (!state.round.result) return NextResponse.json({ error: "Betting is open. Wait for the shared result." }, { status: 409 });
    return NextResponse.json({ ...state.round.result, roundNo: state.round.roundNo });
  } catch (error) {
    console.error("[birds-beasts idle round]", error);
    return NextResponse.json({ error: "Live round result unavailable. Reconnect and retry." }, { status: 503 });
  }
}
