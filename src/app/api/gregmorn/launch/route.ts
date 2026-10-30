import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { GregmornLaunchError, openGregmornGame } from "@/lib/gregmorn";
import { getProviderCatalog, saveProviderGame } from "@/lib/gregmornCatalog";
import { checkGameAccess } from "@/lib/gameAccess";
import { mysqlMultiplayerStore } from "@/lib/multiplayer-store";
import { gregmornCallbackRoom, registerGregmornSession } from "@/lib/gregmornWallet";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const me = await getServerSessionUser();
  if (!me || me.dbRole !== "client" || !me.isActive) {
    return NextResponse.json({ error: "An active player account is required." }, { status: 401 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("gameId" in body) ||
      typeof body.gameId !== "string" || !body.gameId.trim() || body.gameId.length > 255) {
    return NextResponse.json({ error: "Select a valid provider game." }, { status: 400 });
  }
  if (!me.displayId) return NextResponse.json({ error: "Your game account is not ready. Please retry." }, { status: 409 });

  let stage = "catalogue";
  try {
    const currency = process.env.GREGMORN_CURRENCY ?? "PKR";
    const games = await getProviderCatalog(currency);
    const game = games.find(game => game.id === body.gameId && game.isActive);
    if (!game) {
      return NextResponse.json({ error: "This provider game is not enabled for your currency." }, { status: 404 });
    }
    stage = "game_settings";
    const saved = await saveProviderGame(game);
    const denied = await checkGameAccess(me.id, game.slug);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
    const exitUrl = process.env.GREGMORN_EXIT_URL;
    if (!exitUrl) throw new Error("Gregmorn launch requires GREGMORN_EXIT_URL.");
    stage = "provider_launch";
    const session = await openGregmornGame({
      gameId: body.gameId,
      playerLogin: me.displayId,
      balance: me.balance,
      exitUrl,
    });
    stage = "session_registration";
    await mysqlMultiplayerStore.transact(gregmornCallbackRoom(session.sessionId), tx => registerGregmornSession(tx, {
      sessionId: session.sessionId,
      userId: me.id,
      playerLogin: session.playerLogin,
      gameId: session.gameId,
      currency: session.currency,
      catalogGameId: String(saved._id),
    }));
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[gregmorn launch]", { stage, error });
    const code = error instanceof GregmornLaunchError ? error.reason : stage;
    return NextResponse.json({
      error: `The provider game could not be launched. Please contact support with code: ${code}.`,
      code,
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
