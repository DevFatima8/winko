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
    const configuredExitUrl = process.env.GREGMORN_EXIT_URL;
    if (!configuredExitUrl) throw new Error("Gregmorn launch requires GREGMORN_EXIT_URL.");
    let exitUrl = configuredExitUrl;
    if ("returnTo" in body) {
      if (typeof body.returnTo !== "string" || !body.returnTo.startsWith("/") || body.returnTo.startsWith("//") || body.returnTo.includes("\\") || body.returnTo.length > 2048) {
        return NextResponse.json({ error: "Invalid game return location." }, { status: 400 });
      }
      const base = new URL(configuredExitUrl);
      const target = new URL(body.returnTo, base.origin);
      if (target.origin !== base.origin || !["/", "/games-all", "/player"].includes(target.pathname)) {
        return NextResponse.json({ error: "Invalid game return location." }, { status: 400 });
      }
      exitUrl = target.toString();
    }
    stage = "provider_launch";
    let session: Awaited<ReturnType<typeof openGregmornGame>>;
    try {
      session = await openGregmornGame({
        gameId: body.gameId,
        playerLogin: me.displayId,
        balance: me.balance,
        exitUrl,
      });
    } catch (error) {
      if (!(error instanceof GregmornLaunchError) || error.reason !== "session_in_progress") throw error;
      console.info("[gregmorn launch] Opening a view-only demo after the provider reported an unfinished session.");
      session = await openGregmornGame({
        gameId: body.gameId,
        playerLogin: me.displayId,
        balance: 0,
        exitUrl,
        demo: true,
      });
    }
    stage = "session_registration";
    await mysqlMultiplayerStore.transact(gregmornCallbackRoom(session.sessionId), tx => registerGregmornSession(tx, {
      sessionId: session.sessionId,
      userId: me.id,
      playerLogin: session.playerLogin,
      gameId: session.gameId,
      currency: session.currency,
      catalogGameId: String(saved._id),
      ...(session.demo ? { demo: true } : {}),
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
