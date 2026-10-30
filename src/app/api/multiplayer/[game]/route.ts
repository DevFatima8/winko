import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { isMultiplayerGame, multiplayer, MultiplayerError } from "@/lib/multiplayer";
import type { MultiplayerAction } from "@/lib/multiplayer-types";
import { isAllowedGameOrigin } from "@/lib/requestOrigin";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, max-age=0" };
type Context = { params: Promise<{ game: string }> };
function failure(error: unknown) {
  if (error instanceof MultiplayerError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error("[multiplayer]", error);
  return NextResponse.json({ error: "Live table is temporarily unavailable." }, { status: 503, headers });
}
export async function GET(_request: Request, context: Context) {
  try {
    const { game } = await context.params;
    if (!isMultiplayerGame(game)) throw new MultiplayerError("Unknown multiplayer game.", 404);
    const user = await getServerSessionUser();
    return NextResponse.json(await multiplayer.read(game, user?.dbRole === "client" ? user.id : null), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { game } = await context.params;
    if (!isMultiplayerGame(game)) throw new MultiplayerError("Unknown multiplayer game.", 404);
    const user = await getServerSessionUser();
    if (!user) throw new MultiplayerError("Login is required.", 401);
    if (user.dbRole !== "client") throw new MultiplayerError("Only player accounts may place wagers.", 403);
    if (!isAllowedGameOrigin(request)) throw new MultiplayerError("Cross-origin actions are not allowed.", 403);
    let action: MultiplayerAction;
    try { action = await request.json() as MultiplayerAction; }
    catch { throw new MultiplayerError("Invalid JSON body."); }
    if (!LOCAL_GAMES_CONNECTED && action.action === "bet") throw new MultiplayerError(LOCAL_GAMES_UNAVAILABLE, 403);
    return NextResponse.json(await multiplayer.act(game, user.id, action), { headers });
  } catch (error) { return failure(error); }
}
