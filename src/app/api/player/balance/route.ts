import { NextResponse } from "next/server";
import { GameResult, User, oid } from "@/models";
import { getServerSessionUser } from "@/lib/serverAuth";
import { dbConnect } from "@/lib/mongo";
import { dailyPoolEnabled } from "@/lib/dailyPoolConfig";
import { BrowserWagerError, browserPoolLifecycle, isBrowserPoolGame, playBrowserWager, playServerBrowserWager, resolveServerBrowserWager } from "@/lib/dailyPoolBrowser";
import { dailyPoolLock, isDailyPoolGame } from "@/lib/dailyPoolRules";
import { mysqlMultiplayerStore } from "@/lib/multiplayer-store";
import { isCardGame } from "@/lib/cardGameRules";
import { isRouletteGame, isWheelGame } from "@/lib/rouletteGameRules";
import { isSlotGame } from "@/lib/slotGameRules";
import { actBrowserCard } from "@/lib/browserCardActions";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "@/lib/gameAvailability";

export const dynamic = "force-dynamic";

/**
 * Central Unified Balance API
 * GET: returns the current authenticated user's DB balance
 * POST: updates the balance for game betting and wins
 */
export async function GET() {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") {
      return NextResponse.json({ ok: false, loggedIn: false, balance: 0 }, { status: 200 });
    }

    await dbConnect();
    const user = await User.findById(oid(me.id), "balance name phone totalDeposited totalWithdrawn").lean();
    if (!user) {
      return NextResponse.json({ ok: false, loggedIn: false, balance: 0 }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      loggedIn: true,
      balance: Math.round((user.balance ?? 0) * 100) / 100,
      dailyPoolEnabled: dailyPoolEnabled(),
      user: {
        id: String(user._id),
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("[balance GET error]", error);
    return NextResponse.json({ error: "Failed to retrieve balance." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "client") {
      return NextResponse.json({ error: "Khelne ke liye Login zaroori hai.", loggedIn: false }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (!LOCAL_GAMES_CONNECTED && (!body.action || ["accept", "increment", "play", "server-play"].includes(body.action))) {
      return NextResponse.json({ error: LOCAL_GAMES_UNAVAILABLE }, { status: 403 });
    }
    const game = String(body.game ?? "game").trim();
    const poolEnabled = !isCardGame(game) && !isRouletteGame(game) && !isWheelGame(game) && !isSlotGame(game) && game !== "thai-hi-lo" && dailyPoolEnabled();
    if (body.action && body.ownerId !== me.id) {
      return NextResponse.json({ error: "Saved wager account does not match the signed-in account." }, { status: 409 });
    }
    if (["accept", "increment", "complete", "refund", "award", "reduce", "resolve", "card-action"].includes(body.action)) {
      if (!isBrowserPoolGame(game) || !isDailyPoolGame(game)) {
        return NextResponse.json({ error: "Explicit pool lifecycle is unavailable for this game." }, { status: 409 });
      }
      if (body.action === "card-action" && !isCardGame(game)) {
        return NextResponse.json({ error: "Card moves are unavailable for this game." }, { status: 409 });
      }
      try {
        return NextResponse.json(await mysqlMultiplayerStore.transact(dailyPoolLock(game), async tx => body.action === "card-action"
          ? await actBrowserCard(tx, me.id, {
            game, wagerId: String(body.wagerId ?? ""), operationId: String(body.operationId ?? ""),
            move: typeof body.selection?.move === "string" ? body.selection.move : "",
            selection: body.selection?.selection,
          }, poolEnabled)
          : body.action === "resolve"
          ? await resolveServerBrowserWager(tx, me.id, { game, wagerId: String(body.wagerId ?? ""), operationId: String(body.operationId ?? ""), selection: body.selection }, poolEnabled)
          : await browserPoolLifecycle(tx, me.id, {
            game, wagerId: String(body.wagerId ?? ""), operationId: String(body.operationId ?? ""),
            action: body.action, amount: body.amount, poolVersion: body.poolVersion,
          }, poolEnabled)));
      } catch (error) {
        if (!(error instanceof BrowserWagerError)) console.error("[browser wager lifecycle]", error);
        return NextResponse.json({ error: error instanceof BrowserWagerError ? error.message : "Wager confirmation unavailable. Retry the same action." }, { status: error instanceof BrowserWagerError ? 409 : 500 });
      }
    }
    if (body.action === "play" || body.action === "server-play") {
      if (!isBrowserPoolGame(game) || !isDailyPoolGame(game)) {
        return NextResponse.json({ error: "Daily-pool betting is not supported for this browser game yet." }, { status: 409 });
      }
      try {
        const input = { game, wagerId: String(body.wagerId ?? ""), stake: body.stake, claim: body.claim,
          poolVersion: body.poolVersion, selection: body.selection };
        const result = await mysqlMultiplayerStore.transact(dailyPoolLock(game), tx =>
          body.action === "server-play" ? playServerBrowserWager(tx, me.id, input, poolEnabled) : playBrowserWager(tx, me.id, input, poolEnabled));
        return NextResponse.json(result);
      } catch (error) {
        if (!(error instanceof BrowserWagerError)) console.error("[browser wager play]", error);
        return NextResponse.json({ error: error instanceof BrowserWagerError ? error.message : "Wager unavailable. Retry the same wager identity." }, { status: error instanceof BrowserWagerError ? 409 : 500 });
      }
    }
    if (isCardGame(game) || isRouletteGame(game) || isWheelGame(game) || isSlotGame(game) || game === "thai-hi-lo") {
      return NextResponse.json({
        error: "This game requires an explicit accepted-wager lifecycle; balance deltas cannot create stakes or winnings.",
      }, { status: 409 });
    }
    if (poolEnabled) {
      return NextResponse.json({
        error: "This browser game has no supported daily-pool wager lifecycle. New betting is disabled; balance deltas cannot create stakes or claims.",
      }, { status: 409 });
    }
    let delta = Number(body.delta);
    const bet = Number(body.bet);
    const win = Number(body.win);

    if (!Number.isFinite(delta)) {
      if (Number.isFinite(bet) || Number.isFinite(win)) {
        delta = (Number.isFinite(win) ? win : 0) - (Number.isFinite(bet) ? bet : 0);
      } else {
        delta = 0;
      }
    }

    delta = Math.round(delta * 100) / 100;

    await dbConnect();
    const uid = oid(me.id);

    // If delta is negative (user placed bet or lost), ensure they have sufficient funds
    if (delta < 0) {
      const required = Math.abs(delta);
      const updateResult = await User.updateOne(
        { _id: uid, balance: { $gte: required } },
        { $inc: { balance: delta } }
      );

      if (!updateResult.modifiedCount) {
        const currentUser = await User.findById(uid, "balance").lean();
        return NextResponse.json(
          {
            error: "Insufficient balance! Please deposit funds via Easypaisa or JazzCash.",
            balance: currentUser?.balance ?? 0,
            insufficient: true,
          },
          { status: 400 }
        );
      }
    } else if (delta > 0) {
      // User won, add amount to balance
      await User.updateOne({ _id: uid }, { $inc: { balance: delta } });
    }

    // Record game result if bet or win occurred
    const betAmt = Number.isFinite(bet) && bet > 0 ? bet : (delta < 0 ? Math.abs(delta) : 0);
    const winAmt = Number.isFinite(win) && win > 0 ? win : (delta > 0 ? delta : 0);

    if (betAmt > 0 || winAmt > 0) {
      try {
        await GameResult.create({
          gameId: game,
          userId: uid,
          betAmount: betAmt,
          winAmount: winAmt,
          outcome: winAmt > betAmt ? "win" : winAmt === betAmt ? "pending" : "lose",
          resultData: `${game} round: bet Rs. ${betAmt}, win Rs. ${winAmt}`,
        });
      } catch (e) {
        // Logging game result shouldn't block balance update
        console.warn("[GameResult create error]", e);
      }
    }

    const updatedUser = await User.findById(uid, "balance").lean();
    const finalBalance = Math.round((updatedUser?.balance ?? 0) * 100) / 100;

    return NextResponse.json({
      ok: true,
      balance: finalBalance,
      delta,
      game,
    });
  } catch (error) {
    console.error("[balance POST error]", error);
    return NextResponse.json({ error: "Balance update failed." }, { status: 500 });
  }
}
