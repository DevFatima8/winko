import { createHash, randomInt, randomUUID } from "node:crypto";
import { Game, type AviatorRoundDoc, type CardBetDoc, type CardRoundDoc, type GameResultDoc, type UserDoc, type WinHoldDoc } from "@/models";
import { mysqlMultiplayerStore, type MultiplayerTransaction } from "./multiplayer-store";
import * as flight from "./aviator";
import * as cards from "./cards";
import { heldPortion } from "./winHold";
import { addPoolWager, closePoolWager, settleDailyPools, type PoolFields } from "./dailyPool";
import { dailyPoolLock } from "./dailyPoolRules";
import { dailyPoolEnabled } from "./dailyPoolConfig";
import { isCardGame } from "./cardGameRules";
import { nextPlayerWin } from "./playerWinCycle";

const FLIGHT_ROOM = "aviator:shared:v2";
const LIMIT = 1000;
const money = (value: number) => Math.round(value * 100) / 100;
const stamp = (value: Date | string | number) => new Date(value).getTime();
const mask = (name?: string | null) => name ? `${name.slice(0, 1)}***${name.slice(-1)}` : "P***r";
const gameIds = new Map<string, string>();
type Tx = MultiplayerTransaction;
type LiveResult = GameResultDoc & PoolFields & { sharedRoom?: string; publicName?: string };
type LiveCardBet = CardBetDoc & PoolFields & { publicName?: string; poolResultId?: string; personalRoom?: string };
type CardContext = { table: cards.Table; room: string; personal: boolean; spectator: boolean };
type FlightContext = { table: flight.Table; room: string; userId: string | null };

async function wallet(tx: Tx, userId: string) {
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user || !Number.isFinite(user.balance)) throw new Error("Player wallet unavailable.");
  return user;
}

async function saveWallet(tx: Tx, user: UserDoc, delta: number, now: number) {
  user.balance = money(user.balance + delta);
  user.updatedAt = new Date(now);
  await tx.put("users", user._id, user);
}

async function hold(tx: Tx, userId: string, gross: number, now: number) {
  const amount = heldPortion(gross);
  if (!amount) return;
  const _id = randomUUID();
  const row: WinHoldDoc = { _id, userId, amount, claimed: false, claimedAt: null, unlockAt: new Date(now), createdAt: new Date(now), updatedAt: new Date(now) };
  await tx.insert("winholds", _id, row);
}

async function gameId(slug: string, name: string) {
  const cached = gameIds.get(slug);
  if (cached) return cached;
  const game = await Game.findOneAndUpdate(
    { slug }, { $setOnInsert: { slug, name, isActive: true, category: "original" } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (!game) throw new Error("Game unavailable.");
  gameIds.set(slug, game._id);
  return game._id;
}

async function flightBets(tx: Tx, gid: string, roundNo: number, context: FlightContext) {
  return tx.findWhere<LiveResult>("gameresults", { gameId: gid, roundNo, ...(context.table === "aviator" ? { sharedRoom: context.room } : { userId: context.userId }) }, LIMIT);
}

async function crashAfterCashouts(tx: Tx, gid: string, round: AviatorRoundDoc, context: FlightContext, now: number, multiplier: number) {
  if (context.table !== "aviator") return;
  const bets = await flightBets(tx, gid, round.roundNo, context);
  if (bets.length >= LIMIT) throw new Error("Flight participant limit exceeded.");
  const players = new Set(bets.map(bet => bet.userId));
  const cashed = new Set(bets.filter(bet => bet.outcome === "win").map(bet => bet.userId));
  if (!players.size || cashed.size < Math.ceil(players.size / 5)) return;
  for (const bet of bets.filter(bet => bet.outcome === "pending")) {
    await closePoolWager(tx, bet._id, 0);
    Object.assign(bet, { outcome: "lose", resultData: `Flew away @ ${multiplier.toFixed(2)}x`, updatedAt: new Date(now) });
    await tx.put("gameresults", bet._id, bet);
  }
  Object.assign(round, { status: "crashed", crashPoint: multiplier, endedAt: new Date(now), updatedAt: new Date(now) });
  await tx.put("aviatorrounds", round._id, round);
}

async function advanceFlight(tx: Tx, gid: string, context: FlightContext) {
  const cfg = flight.TABLES[context.table];
  let now = await tx.now();
  let round = (await tx.findWhere<AviatorRoundDoc>("aviatorrounds", { table: context.room }, 1, { field: "roundNo", direction: "desc" }))[0];
  if (!round) {
    const scope = { gameId: gid, ...(context.table === "aviator" ? {} : { userId: context.userId }) };
    const latest = (await tx.findWhere<LiveResult>("gameresults", scope, 1, { field: "roundNo", direction: "desc" }))[0];
    const roundNo = (latest?.roundNo ?? 0) + 1;
    const pending = await tx.findWhere<LiveResult>("gameresults", { ...scope, outcome: "pending" }, LIMIT);
    if (pending.length === LIMIT) throw new Error("Too many legacy reservations to migrate safely. Contact support.");
    const slots = new Map<string, number>();
    for (const bet of pending.sort((a, b) => stamp(a.createdAt) - stamp(b.createdAt))) {
      const key = `${bet.userId}:${bet.betSlot}`;
      const index = slots.get(key) ?? 0;
      const user = bet.userId ? await tx.get<UserDoc>("users", bet.userId) : null;
      Object.assign(bet, { roundNo: roundNo + index, sharedRoom: context.room, publicName: mask(user?.username || user?.name), updatedAt: new Date(now) });
      await tx.put("gameresults", bet._id, bet);
      slots.set(key, index + 1);
    }
    round = await createFlight(tx, roundNo, now, context);
  }
  for (let guard = 0; guard < 128; guard++) {
    now = await tx.now();
    const crashAt = stamp(round.startsAt) + Math.log(round.crashPoint) / cfg.growth * 1000 + 1;
    if (round.status !== "crashed" && now >= crashAt) {
      const bets = await flightBets(tx, gid, round.roundNo, context);
      for (const bet of bets) if (bet.outcome === "pending") {
        await closePoolWager(tx, bet._id, 0);
        Object.assign(bet, { outcome: "lose", resultData: `Flew away @ ${round.crashPoint.toFixed(2)}x`, updatedAt: new Date(now) });
        await tx.put("gameresults", bet._id, bet);
      }
      round = { ...round, status: "crashed", endedAt: new Date(crashAt), updatedAt: new Date(now) };
      await tx.put("aviatorrounds", round._id, round);
    } else if (round.status === "waiting" && now >= stamp(round.startsAt)) {
      round = { ...round, status: "running", updatedAt: new Date(now) };
      await tx.put("aviatorrounds", round._id, round);
    }
    if (round.status !== "crashed" || !round.endedAt || now < stamp(round.endedAt) + cfg.pauseMs) return round;
    let anchor = stamp(round.endedAt) + cfg.pauseMs;
    let nextNo = round.roundNo + 1;
    const pending = await tx.findWhere<LiveResult>("gameresults", { gameId: gid, ...(context.table === "aviator" ? { sharedRoom: context.room } : { userId: context.userId }), outcome: "pending" }, LIMIT);
    if (!pending.length) {
      const duration = cfg.waitMs + Math.log(round.crashPoint) / cfg.growth * 1000 + 1 + cfg.pauseMs;
      const skipped = Math.max(0, Math.floor((now - anchor) / duration));
      anchor += skipped * duration;
      nextNo += skipped;
    }
    round = await createFlight(tx, nextNo, anchor, context);
  }
  throw new Error("Live flight is catching up. Please retry shortly.");
}

async function createFlight(tx: Tx, roundNo: number, anchor: number, context: FlightContext) {
  const now = new Date(anchor);
  const round: AviatorRoundDoc = {
    _id: randomUUID(), table: context.room, roundNo, crashPoint: flight.generateCrashPoint(context.table).crashPoint,
    status: "waiting", startsAt: new Date(anchor + flight.TABLES[context.table].waitMs), endedAt: null,
    createdAt: now, updatedAt: now,
  };
  await tx.insert("aviatorrounds", round._id, round);
  return round;
}

async function withFlight<T>(fn: (tx: Tx, round: AviatorRoundDoc, gid: string, context: FlightContext) => Promise<T>, table: flight.Table = "aviator", userId: string | null = null) {
  const gid = await flight.getGameId(table);
  const context = { table, userId, room: table === "aviator" ? FLIGHT_ROOM : `${table}:${userId ?? "guest"}` };
  return mysqlMultiplayerStore.transact(dailyPoolLock(table), async (tx) => {
    await settleDailyPools(tx, table);
    const round = await advanceFlight(tx, gid, context);
    if (table === "aviator" && round.status === "running") {
      const now = await tx.now();
      const multiplier = Math.min(round.crashPoint, flight.multiplierAt(table, new Date(round.startsAt), new Date(now)));
      await crashAfterCashouts(tx, gid, round, context, now, multiplier);
    }
    const result = await fn(tx, round, gid, context);
    return result;
  });
}

export async function sharedFlightState(userId: string | null, table: flight.Table = "aviator") {
  return withFlight(async (tx, round, gid, context) => {
    const current = await flightBets(tx, gid, round.roundNo, context);
    const queued = userId ? (await flightBets(tx, gid, round.roundNo + 1, context)).filter((bet) => bet.userId === userId && bet.outcome === "pending") : [];
    const history = await tx.findWhere<AviatorRoundDoc>("aviatorrounds", { table: context.room, status: "crashed" }, 40, { field: "roundNo", direction: "desc" });
    const own = userId ? await tx.findWhere<LiveResult>("gameresults", { gameId: gid, userId }, 30, { field: "createdAt", direction: "desc" }) : [];
    const top = await tx.findWhere<LiveResult>("gameresults", { gameId: gid, outcome: "win" }, 20, { field: "winAmount", direction: "desc" });
    const names = new Map<string, string>();
    for (const bet of [...current, ...top]) if (bet.userId && bet.publicName) names.set(bet.userId, bet.publicName);
    for (const id of new Set([...current.slice(-200), ...top].flatMap((bet) => bet.userId && !names.has(bet.userId) ? [bet.userId] : []))) {
      const user = await tx.get<UserDoc>("users", id);
      names.set(id, mask(user?.username || user?.name));
    }
    const mult = (bet: LiveResult) => {
      const match = bet.resultData?.match(/@\s*([0-9.]+)x/i);
      return match ? Number(match[1]) : null;
    };
    const me = userId ? await tx.get<UserDoc>("users", userId) : null;
    const cfg = flight.TABLES[table];
    const serverNow = await tx.now();
    // Bound the display even if the round crossed its crash time while these reads ran.
    const multiplier = round.status === "crashed" ? round.crashPoint : Math.min(
      round.crashPoint, cfg.maxMult,
      Math.exp(cfg.growth * Math.max(0, (serverNow - stamp(round.startsAt)) / 1000)),
    );
    return {
      serverNow, table,
      config: { name: cfg.name, slots: cfg.slots, minBet: cfg.minBet, maxBet: cfg.maxBet, waitMs: cfg.waitMs, pauseMs: cfg.pauseMs, growth: cfg.growth, maxMult: cfg.maxMult },
      round: { id: round.roundNo, key: round._id, status: round.status, idle: false, startsAt: stamp(round.startsAt), endedAt: round.endedAt ? stamp(round.endedAt) : null, crashPoint: round.status === "crashed" ? round.crashPoint : null, multiplier },
      history: history.map((row) => ({ id: row.roundNo, crashPoint: row.crashPoint })),
      bets: current.slice(-200).map((bet) => ({ id: bet._id, name: names.get(bet.userId ?? "") ?? "P***r", bet: bet.betAmount, win: bet.winAmount, outcome: bet.outcome, data: bet.resultData, mult: mult(bet), poolPending: bet.poolPending, poolClaim: bet.poolClaim })),
      totals: { count: current.length, amount: money(current.reduce((sum, bet) => sum + bet.betAmount, 0)), cashed: current.filter((bet) => bet.outcome === "win").length },
      myBets: current.filter((bet) => bet.userId === userId && userId !== null).map((bet) => ({ id: bet._id, slot: bet.betSlot, bet: bet.betAmount, win: bet.winAmount, outcome: bet.outcome, data: bet.resultData, poolPending: bet.poolPending, poolClaim: bet.poolClaim, poolVersion: bet.poolVersion })),
      queued: queued.map((bet) => ({ slot: bet.betSlot, bet: bet.betAmount })),
      myHistory: own.filter((bet) => bet.outcome !== "pending").map((bet) => ({ id: bet._id, round: bet.roundNo, bet: bet.betAmount, win: bet.winAmount, outcome: bet.outcome, at: bet.createdAt, poolPending: bet.poolPending, poolClaim: bet.poolClaim })),
      top: top.filter(bet => !bet.poolPending && bet.winAmount > 0).map((bet) => ({ name: names.get(bet.userId ?? "") ?? "P***r", bet: bet.betAmount, win: bet.winAmount, mult: mult(bet) ?? 1, round: bet.roundNo })),
      balance: me?.balance ?? 0,
    };
  }, table, userId);
}

export async function sharedFlightBet(userId: string, amount: number, slot: number, expectedRound?: number, table: flight.Table = "aviator", queueIfClosed = false) {
  return withFlight(async (tx, round, gid, context) => {
    const user = await wallet(tx, userId);
    if (!user.isActive || user.role !== "client" || user.blockedGames?.includes(table)) return { error: "This account cannot bet on this game." };
    if (user.balance < amount) return { error: "Insufficient balance." };
    const now = await tx.now();
    let target = round.status === "waiting" && now < stamp(round.startsAt) ? round.roundNo : round.roundNo + 1;
    const canQueue = table === "aviator" && queueIfClosed;
    if (expectedRound !== undefined && expectedRound !== target && !(canQueue && target === expectedRound + 1)) return { error: "Round changed. Check the live flight and try again." };
    let bets = await flightBets(tx, gid, target, context);
    if (target === round.roundNo && await tx.now() >= stamp(round.startsAt)) {
      if (!canQueue) return { error: "Betting closed while processing. Please try the next flight." };
      target = round.roundNo + 1;
      bets = await flightBets(tx, gid, target, context);
    }
    if (bets.some((bet) => bet.userId === userId && bet.betSlot === slot)) return { error: "Bet already placed." };
    if (bets.length >= LIMIT - 1) return { error: "This flight is full. Please wait for the next round." };
    const _id = randomUUID();
    const bet: LiveResult = { _id, gameId: gid, userId, roundNo: target, betSlot: slot, betAmount: amount, winAmount: 0, outcome: "pending", resultData: null, sharedRoom: context.room, publicName: mask(user.username || user.name), createdAt: new Date(now), updatedAt: new Date(now) };
    if (dailyPoolEnabled()) await addPoolWager(tx, table, bet);
    await saveWallet(tx, user, -amount, now);
    await tx.insert("gameresults", _id, bet);
    return {
      ok: true, round: target, queued: target !== round.roundNo, balance: user.balance,
      bet: { id: _id, slot, bet: amount, win: 0, outcome: "pending", data: null, poolPending: bet.poolPending, poolVersion: bet.poolVersion },
    };
  }, table, userId);
}

export async function sharedFlightCancel(userId: string, slot: number, expectedRound?: number, table: flight.Table = "aviator") {
  return withFlight(async (tx, round, gid, context) => {
    const open = round.status === "waiting" && await tx.now() < stamp(round.startsAt);
    const targets = open ? [round.roundNo, round.roundNo + 1] : [round.roundNo + 1];
    const bets = (await Promise.all(targets.map((target) => flightBets(tx, gid, target, context)))).flat();
    const bet = bets.find((row) => row.userId === userId && row.betSlot === slot && row.outcome === "pending" && (expectedRound === undefined || row.roundNo === expectedRound));
    if (!bet) return { error: "No cancellable bet found. Check the current round." };
    const user = await wallet(tx, userId);
    if (bet.roundNo === round.roundNo && await tx.now() >= stamp(round.startsAt)) return { error: "Round started. This bet cannot be cancelled." };
    await closePoolWager(tx, bet._id, 0, true);
    await saveWallet(tx, user, bet.betAmount, await tx.now());
    await tx.remove("gameresults", bet._id);
    return { ok: true };
  }, table, userId);
}

export async function sharedFlightCashout(userId: string, slot: number, expectedRound?: number, table: flight.Table = "aviator") {
  return withFlight(async (tx, round, gid, context) => {
    if (expectedRound !== undefined && expectedRound !== round.roundNo) return { error: "Round changed. Check the current flight." };
    if (round.status !== "running") return { error: round.status === "crashed" ? "Flew away!" : "Round not started." };
    const user = await wallet(tx, userId);
    const bet = (await flightBets(tx, gid, round.roundNo, context)).find((row) => row.userId === userId && row.betSlot === slot && row.outcome === "pending");
    if (!bet) return { error: "No active bet." };
    const now = await tx.now();
    const multiplier = flight.multiplierAt(table, new Date(round.startsAt), new Date(now));
    if (multiplier >= round.crashPoint) return { error: "Flew away!" };
    const claim = money(bet.betAmount * multiplier);
    if (await closePoolWager(tx, bet._id, claim)) {
      Object.assign(bet, { outcome: "win", winAmount: 0, poolClaim: claim, resultData: `claim @ ${multiplier.toFixed(2)}x | daily`, updatedAt: new Date(now) });
      await tx.put("gameresults", bet._id, bet);
      await crashAfterCashouts(tx, gid, round, context, now, multiplier);
      return { ok: true, multiplier, win: 0, netWin: 0, poolPending: true, poolClaim: claim };
    }
    const netWin = Math.floor(bet.betAmount * multiplier * 0.98 * 100) / 100;
    const win = Math.floor((bet.betAmount + netWin) * 100) / 100;
    Object.assign(bet, { outcome: "win", winAmount: win, resultData: `Cashed out @ ${multiplier.toFixed(2)}x`, updatedAt: new Date(now) });
    await tx.put("gameresults", bet._id, bet);
    await saveWallet(tx, user, win, now);
    await hold(tx, userId, bet.betAmount * multiplier, now);
    await crashAfterCashouts(tx, gid, round, context, now, multiplier);
    return { ok: true, multiplier, win, netWin };
  }, table, userId);
}

async function cardRows(tx: Tx, table: cards.Table, roundNo: number, room?: string) {
  if (!room) {
    const rows: LiveCardBet[] = [];
    let after = "";
    for (;;) {
      const page = await tx.page<LiveCardBet>("cardbets", { table }, after);
      rows.push(...page.filter(bet => bet.roundNo === roundNo && !bet.personalRoom));
      if (page.length < 500) return rows;
      after = page[page.length - 1]._id;
    }
  }
  const rows = await tx.findWhere<LiveCardBet>("cardbets", { table, roundNo, ...(room ? { personalRoom: room } : {}) }, LIMIT);
  if (rows.length === LIMIT) throw new Error("Too many card wagers to settle safely. Contact support.");
  return room ? rows : rows.filter(bet => !bet.personalRoom);
}

async function settleCards(tx: Tx, round: CardRoundDoc, gid: string) {
  const result = JSON.parse(round.result) as cards.Result;
  const bets = (await cardRows(tx, round.table, round.roundNo)).filter((bet) => bet.status === "pending");
  const now = await tx.now();
  for (const userId of [...new Set(bets.map((bet) => bet.userId))].sort()) {
    const mine = bets.filter((bet) => bet.userId === userId);
    const user = await wallet(tx, userId);
    let payout = 0, gross = 0;
    for (const bet of mine.filter(bet => bet.poolVersion)) {
      if (!bet.poolResultId) throw new Error("Daily-pool card result identity missing.");
      const claim = money(cards.rawPayoutFor(result, bet.option, bet.amount));
      await closePoolWager(tx, bet.poolResultId, claim);
      bet.payout = 0;
      bet.poolClaim = claim;
      bet.status = claim > 0 ? "win" : "lose";
      bet.updatedAt = new Date(now);
      const record = await tx.get<GameResultDoc>("gameresults", bet.poolResultId);
      if (!record) throw new Error("Daily-pool card result missing.");
      Object.assign(record, { poolClaim: claim, winAmount: 0, outcome: claim > 0 ? "win" : "lose", resultData: `${cards.describe(result)} | Rs. ${claim.toFixed(2)} — daily payout`, updatedAt: new Date(now) });
      await tx.put("gameresults", record._id, record);
      await tx.put("cardbets", bet._id, bet);
    }
    const legacy = mine.filter(bet => !bet.poolVersion);
    if (!legacy.length) continue;
    for (const bet of legacy) {
      bet.payout = money(cards.payoutFor(result, bet.option, bet.amount));
      bet.status = bet.payout > bet.amount ? "win" : bet.payout > 0 ? "push" : "lose";
      payout += bet.payout;
      if (bet.status === "win") gross += Math.min(50 * bet.amount, cards.rawPayoutFor(result, bet.option, bet.amount));
      bet.updatedAt = new Date(now);
      await tx.put("cardbets", bet._id, bet);
    }
    if (payout > 0) await saveWallet(tx, user, money(payout), now);
    await hold(tx, userId, gross, now);
    const record = (await tx.findWhere<GameResultDoc>("gameresults", { gameId: gid, roundNo: round.roundNo, userId }, LIMIT)).find(row => !row.poolVersion);
    if (!record) throw new Error("Reserved card wager record missing.");
    Object.assign(record, { winAmount: money(payout), outcome: payout > 0 ? "win" : "lose", resultData: cards.describe(result), updatedAt: new Date(now) });
    await tx.put("gameresults", record._id, record);
  }
}

async function createCards(tx: Tx, table: cards.Table, roundNo: number, anchor: number) {
  const { result, revealMs } = cards.generate(table);
  const round: CardRoundDoc = {
    _id: randomUUID(), table, roundNo, status: "betting", bettingEndsAt: new Date(anchor + cards.TABLES[table].betMs),
    revealEndsAt: new Date(anchor + cards.TABLES[table].betMs + revealMs), result: JSON.stringify(result), winner: result.winner,
    createdAt: new Date(anchor), updatedAt: new Date(anchor),
  };
  await tx.insert("cardrounds", round._id, round);
  return round;
}

async function pendingLegacyCards(tx: Tx, table: cards.Table) {
  const rows: LiveCardBet[] = [];
  let after = "";
  for (;;) {
    const page = await tx.page<LiveCardBet>("cardbets", { table, status: "pending" }, after);
    rows.push(...page.filter(bet => !bet.personalRoom));
    if (page.length < 500) return rows;
    after = page[page.length - 1]._id;
  }
}

async function advanceLegacyCards(tx: Tx, table: cards.Table, gid: string) {
  const pending = await pendingLegacyCards(tx, table);
  for (const roundNo of [...new Set(pending.map(bet => bet.roundNo))].sort((a, b) => a - b)) {
    let round = (await tx.findWhere<CardRoundDoc>("cardrounds", { table, roundNo }, 1))[0];
    if (!round) {
      const previous = (await tx.findWhere<CardRoundDoc>("cardrounds", { table, roundNo: roundNo - 1 }, 1))[0];
      if (!previous) throw new Error("Accepted shared card outcome is missing. Contact support.");
      round = await createCards(tx, table, roundNo, stamp(previous.revealEndsAt));
    }
    const now = await tx.now();
    if (now >= stamp(round.revealEndsAt)) {
      await settleCards(tx, round, gid);
      round.status = "settled";
    } else if (now >= stamp(round.bettingEndsAt)) round.status = "revealing";
    round.updatedAt = new Date(now);
    await tx.put("cardrounds", round._id, round);
  }
}

async function createPersonalCards(tx: Tx, context: CardContext, roundNo: number, anchor: number) {
  const round: CardRoundDoc = {
    _id: randomUUID(), table: context.room as cards.Table, roundNo, status: "betting",
    bettingEndsAt: new Date(anchor + cards.TABLES[context.table].betMs),
    revealEndsAt: new Date(anchor + cards.TABLES[context.table].betMs + 7000),
    result: "", winner: "", createdAt: new Date(anchor), updatedAt: new Date(anchor),
  };
  await tx.insert("cardrounds", round._id, round);
  return round;
}

async function settlePersonalCards(tx: Tx, context: CardContext, round: CardRoundDoc, gid: string) {
  const bets = (await cardRows(tx, context.table, round.roundNo, context.room)).filter(bet => bet.status === "pending");
  if (!bets.length) return;
  if (!round.result) throw new Error("Personal card result missing.");
  const result = JSON.parse(round.result) as cards.Result;
  const userId = bets[0].userId;
  if (bets.some(bet => bet.userId !== userId)) throw new Error("Personal card round ownership mismatch.");
  const user = await wallet(tx, userId), now = await tx.now();
  let payout = 0, gross = 0;
  for (const bet of bets) {
    bet.payout = cards.personalPayout(result.winner, bet.option, bet.amount);
    gross += cards.personalGross(result.winner, bet.option, bet.amount);
    payout = money(payout + bet.payout);
    bet.status = bet.payout > bet.amount ? "win" : bet.payout > 0 ? "push" : "lose";
    bet.updatedAt = new Date(now);
    await tx.put("cardbets", bet._id, bet);
  }
  const total = money(bets.reduce((sum, bet) => sum + bet.amount, 0));
  if (money(gross) > money(2 * total) || (payout > 0 && payout <= total)) throw new Error("Personal card payout is outside its allocated band.");
  const record = (await tx.findWhere<LiveResult>("gameresults", { gameId: gid, userId, roundNo: round.roundNo, sharedRoom: context.room }, LIMIT))[0];
  if (!record || record.outcome !== "pending") throw new Error("Reserved personal card wager record missing.");
  Object.assign(record, { winAmount: payout, outcome: payout > total ? "win" : "lose", resultData: cards.describe(result), updatedAt: new Date(now) });
  await tx.put("gameresults", record._id, record);
  if (payout) await saveWallet(tx, user, payout, now);
  await hold(tx, userId, gross, now);
}

async function advancePersonalCards(tx: Tx, context: CardContext, gid: string) {
  let round = (await tx.findWhere<CardRoundDoc>("cardrounds", { table: context.room }, 1, { field: "roundNo", direction: "desc" }))[0];
  if (!round) {
    const shared = (await tx.findWhere<CardRoundDoc>("cardrounds", { table: context.table }, 1, { field: "roundNo", direction: "desc" }))[0];
    round = await createPersonalCards(tx, context, (shared?.roundNo ?? 0) + 1, await tx.now());
  }
  for (let guard = 0; guard < 128; guard++) {
    const now = await tx.now();
    if (round.status === "betting" && now >= stamp(round.bettingEndsAt)) {
      const bets = (await cardRows(tx, context.table, round.roundNo, context.room)).filter(bet => bet.status === "pending");
      if (bets.length) {
        const feasible = cards.personalOutcomes(context.table, bets);
        if (!feasible.wins.length || !feasible.losses.length) throw new Error("Personal wager cannot produce both an allocated net win and a zero return.");
        const won = await nextPlayerWin(tx, context.table, bets[0].userId);
        const choices = won ? feasible.wins : feasible.losses;
        const deal = cards.generateForWinner(context.table, choices[randomInt(choices.length)].winner);
        round.result = JSON.stringify(deal.result);
        round.winner = deal.result.winner;
        round.revealEndsAt = new Date(stamp(round.bettingEndsAt) + deal.revealMs);
      } else {
        const deal = cards.generate(context.table);
        round.result = JSON.stringify(deal.result);
        round.winner = deal.result.winner;
        round.revealEndsAt = new Date(stamp(round.bettingEndsAt) + deal.revealMs);
      }
      round.status = "revealing";
      round.updatedAt = new Date(now);
      await tx.put("cardrounds", round._id, round);
    }
    if (now < stamp(round.revealEndsAt)) return round;
    if (round.status !== "settled") {
      await settlePersonalCards(tx, context, round, gid);
      round.status = "settled";
      round.updatedAt = new Date(now);
      await tx.put("cardrounds", round._id, round);
    }
    let anchor = stamp(round.revealEndsAt), nextNo = round.roundNo + 1;
    const queued = await cardRows(tx, context.table, nextNo, context.room);
    if (!queued.length) {
      const duration = cards.TABLES[context.table].betMs + 7000;
      const skipped = Math.max(0, Math.floor((now - anchor) / duration));
      anchor += skipped * duration;
      nextNo += skipped;
    }
    round = await createPersonalCards(tx, context, nextNo, anchor);
  }
  throw new Error("Personal card table is catching up. Please retry shortly.");
}

async function withCards<T>(table: cards.Table, userId: string | null, fn: (tx: Tx, round: CardRoundDoc, gid: string, context: CardContext) => Promise<T>) {
  const gid = await gameId(table, cards.TABLES[table].name);
  return mysqlMultiplayerStore.transact(dailyPoolLock(table), async tx => {
    await settleDailyPools(tx, table);
    await advanceLegacyCards(tx, table, gid);
    const legacy = userId ? (await pendingLegacyCards(tx, table)).filter(bet => bet.userId === userId).sort((a, b) => a.roundNo - b.roundNo)[0] : null;
    if (legacy) {
      let round = (await tx.findWhere<CardRoundDoc>("cardrounds", { table, roundNo: legacy.roundNo }, 1))[0];
      if (!round) throw new Error("Accepted shared card round missing.");
      if (stamp(round.createdAt) > await tx.now()) {
        round = (await tx.findWhere<CardRoundDoc>("cardrounds", { table, roundNo: round.roundNo - 1 }, 1))[0] ?? round;
      }
      return fn(tx, round, gid, { table, room: table, personal: false, spectator: false });
    }
    const room = `${table}:personal:v1:${userId === null ? "spectator" : `player:${userId}`}`;
    const context: CardContext = { table, room, personal: true, spectator: userId === null };
    const saved = await tx.get<{ ownerId: string | null; game: string }>("multiplayerrooms", room);
    if (saved && (saved.ownerId !== userId || saved.game !== table)) throw new Error("Personal card room ownership mismatch.");
    if (!saved) await tx.put("multiplayerrooms", room, { _id: room, ownerId: userId, game: table, version: 1 });
    return fn(tx, await advancePersonalCards(tx, context, gid), gid, context);
  });
}

export async function sharedCardState(userId: string | null, table: cards.Table) {
  return withCards(table, userId, async (tx, round, _gid, context) => {
    const current = (await cardRows(tx, table, round.roundNo, context.personal ? context.room : undefined)).filter(bet => bet.userId === userId);
    const queued = (await cardRows(tx, table, round.roundNo + 1, context.personal ? context.room : undefined)).filter(bet => bet.userId === userId);
    const mine = current.filter((bet) => userId !== null && bet.userId === userId);
    const myQueued = queued.filter((bet) => userId !== null && bet.userId === userId && bet.status === "pending");
    const history = (await tx.findWhere<CardRoundDoc>("cardrounds", { table: context.room, status: "settled" }, 60, { field: "roundNo", direction: "desc" })).filter(row => row.result);
    const names = new Map<string, string>();
    for (const bet of [...current, ...queued]) if (bet.publicName) names.set(bet.userId, bet.publicName);
    for (const uid of new Set([...current.slice(-200), ...queued.slice(-200)].filter((bet) => !names.has(bet.userId)).map((bet) => bet.userId))) {
      const user = await tx.get<UserDoc>("users", uid);
      names.set(uid, mask(user?.username || user?.name));
    }
    const totals: Record<string, { total: number; players: number }> = {};
    for (const option of Object.keys(cards.TABLES[table].options)) {
      const rows = current.filter((bet) => bet.option === option);
      totals[option] = { total: money(rows.reduce((sum, bet) => sum + bet.amount, 0)), players: new Set(rows.map((bet) => bet.userId)).size };
    }
    const result = round.status === "betting" || !round.result ? null : JSON.parse(round.result) as cards.Result;
    const publicBet = (bet: LiveCardBet) => ({ id: bet._id, name: names.get(bet.userId) ?? "P***r", option: bet.option, amount: bet.amount, roundNo: bet.roundNo, status: bet.status === "push" ? "win" as const : bet.status, payout: bet.payout, mine: bet.userId === userId, poolPending: bet.poolPending, poolClaim: bet.poolClaim, poolVersion: bet.poolVersion });
    const config = cards.TABLES[table];
    const me = userId ? await tx.get<UserDoc>("users", userId) : null;
    return {
      table, tableMode: context.personal ? "personal" as const : "shared" as const, serverNow: await tx.now(), config: { name: config.name, betMs: config.betMs, options: !context.personal && table === "dragon-tiger" ? { ...config.options, tie: { label: "Tie", pays: "8:1", mult: 9 } } : config.options, min: cards.MIN_BET, max: cards.MAX_BET },
      round: { roundNo: round.roundNo, status: round.status, bettingEndsAt: stamp(round.bettingEndsAt), revealEndsAt: stamp(round.revealEndsAt), result },
      myBets: mine.map((bet) => ({ option: bet.option, amount: bet.amount, status: bet.status, payout: bet.payout, poolPending: bet.poolPending, poolClaim: bet.poolClaim, poolVersion: bet.poolVersion })),
      myTotal: money(mine.reduce((sum, bet) => sum + bet.amount, 0)),
      myExpected: result ? money(mine.filter(bet => !bet.poolVersion).reduce((sum, bet) => sum + (context.personal ? cards.personalPayout(result.winner, bet.option, bet.amount) : cards.payoutFor(result, bet.option, bet.amount)), 0)) : 0,
      poolPending: mine.some(bet => bet.poolPending),
      poolClaim: result ? money(mine.filter(bet => bet.poolPending).reduce((sum, bet) => sum + cards.rawPayoutFor(result, bet.option, bet.amount), 0)) : 0,
      queued: { roundNo: round.roundNo + 1, bets: myQueued.map((bet) => ({ option: bet.option, amount: bet.amount })), total: money(myQueued.reduce((sum, bet) => sum + bet.amount, 0)) },
      totals, liveBets: current.slice(-200).map(publicBet), liveQueuedBets: queued.slice(-200).map(publicBet),
      history: history.reverse().map((row) => ({ roundNo: row.roundNo, winner: row.winner })),
      stats: Object.fromEntries(Object.keys(config.options).map((option) => [option, history.filter((row) => row.winner === option).length])),
      balance: me?.balance ?? 0,
    };
  });
}

export async function sharedCardBet(userId: string, table: cards.Table, option: string, amount: number, expectedRound?: number, requestId?: string) {
  return withCards(table, userId, async (tx, round, gid, context) => {
    const requestKey = requestId ? createHash("sha256").update(`legacy:${table}:${userId}:${requestId}`).digest("hex") : null;
    const fingerprint = JSON.stringify({ table, option, amount, expectedRound });
    if (requestKey) {
      const previous = await tx.get<{ fingerprint: string; reply: { ok: true; roundNo: number; queued: boolean } }>("multiplayerrequests", requestKey);
      if (previous) return previous.fingerprint === fingerprint ? previous.reply : { error: "Request ID was already used for a different wager." };
    }
    if (!context.personal) return { error: "Finish your accepted shared round and queued wagers before starting a personal round." };
    if (!Object.hasOwn(cards.TABLES[table].options, option) || !Number.isSafeInteger(amount) || amount < cards.MIN_BET) return { error: "Invalid card wager." };
    const target = cards.betTargetFor(round, await tx.now());
    if (target.queued) return { error: "Betting is closed. Wait for the next round to begin." };
    if (expectedRound !== undefined && expectedRound !== target.roundNo) return { error: "Round changed. Check bet status and try again.", roundChanged: true };
    const current = await cardRows(tx, table, target.roundNo, context.room);
    if (current.length >= LIMIT - 1) return { error: "This table round is full." };
    const allocation = cards.personalOutcomes(table, [...current.filter(bet => bet.status === "pending"), { option, amount }]);
    if (!allocation.losses.length) return { error: "Covering all outcomes is not allowed: this wager must allow a zero-return result." };
    if (!allocation.wins.length) return { error: "This combination cannot produce an allocated net win. Choose a single outcome or reduce covering bets." };
    const user = await wallet(tx, userId);
    if (!user.isActive || user.role !== "client" || user.blockedGames?.includes(table)) return { error: "This account cannot bet on this game." };
    if (user.balance < amount) return { error: "Insufficient balance. Pehle deposit karein." };
    const now = await tx.now();
    const confirmedTarget = cards.betTargetFor(round, now);
    if (confirmedTarget.queued || confirmedTarget.roundNo !== target.roundNo) return { error: "Betting closed while processing. Please try the next round." };
    const _id = randomUUID();
    const bet: LiveCardBet = { _id, userId, table, personalRoom: context.room, roundNo: target.roundNo, option, amount, status: "pending", payout: 0, publicName: mask(user.username || user.name), createdAt: new Date(now), updatedAt: new Date(now) };
    // Only new wagers change mode; persisted poolVersion obligations still settle above.
    const poolMode = dailyPoolEnabled() && !isCardGame(table);
    if (poolMode) {
      const record: GameResultDoc = {
        _id: randomUUID(), gameId: gid, userId, roundNo: target.roundNo, betSlot: current.length + 1,
        betAmount: amount, winAmount: 0, outcome: "pending", resultData: `Daily pool wager: ${option}`, createdAt: new Date(now), updatedAt: new Date(now),
      };
      await addPoolWager(tx, table, record, { sourceTable: "cardbets", sourceId: bet._id });
      await tx.insert("gameresults", record._id, record);
      Object.assign(bet, { poolVersion: record.poolVersion, poolPending: true, poolClaim: 0, poolResultId: record._id });
    }
    await saveWallet(tx, user, -amount, now);
    await tx.insert("cardbets", _id, bet);
    if (!poolMode) {
      const existing = (await tx.findWhere<LiveResult>("gameresults", { gameId: gid, userId, roundNo: target.roundNo, sharedRoom: context.room }, LIMIT)).find(row => !row.poolVersion);
      const record: LiveResult = existing ?? { _id: randomUUID(), gameId: gid, userId, sharedRoom: context.room, roundNo: target.roundNo, betSlot: 0, betAmount: 0, winAmount: 0, outcome: "pending", resultData: null, createdAt: new Date(now), updatedAt: new Date(now) };
      record.betAmount = money(record.betAmount + amount);
      record.updatedAt = new Date(now);
      await tx.put("gameresults", record._id, record);
    }
    const reply = { ok: true as const, roundNo: target.roundNo, queued: target.queued };
    if (requestKey) await tx.insert("multiplayerrequests", requestKey, { userId, game: table, fingerprint, reply, createdAt: new Date(now), updatedAt: new Date(now) });
    return reply;
  });
}

export async function sharedCardCancel(userId: string, table: cards.Table, scope: "current" | "queued", expectedRound?: number) {
  return withCards(table, userId, async (tx, round, gid, context) => {
    const queued = scope === "queued";
    const now = await tx.now();
    if (!queued && (round.status !== "betting" || now >= stamp(round.bettingEndsAt))) return { error: "Ab cancel nahi ho sakta." };
    const roundNo = round.roundNo + (queued ? 1 : 0);
    if (expectedRound !== undefined && expectedRound !== roundNo) return { error: "Round changed. Check bet status before cancelling.", roundChanged: true };
    const bets = (await cardRows(tx, table, roundNo, context.personal ? context.room : undefined)).filter((bet) => bet.userId === userId && bet.status === "pending");
    if (!bets.length) return { error: "No cancellable bets found." };
    const user = await wallet(tx, userId);
    if (!queued && await tx.now() >= stamp(round.bettingEndsAt)) return { error: "Betting has closed. Bets cannot be cancelled." };
    const refund = money(bets.reduce((sum, bet) => sum + bet.amount, 0));
    await saveWallet(tx, user, refund, await tx.now());
    for (const bet of bets) {
      if (bet.poolResultId) {
        await closePoolWager(tx, bet.poolResultId, 0, true);
        await tx.remove("gameresults", bet.poolResultId);
      }
      await tx.remove("cardbets", bet._id);
    }
    for (const record of await tx.findWhere<GameResultDoc>("gameresults", { gameId: gid, userId, roundNo }, LIMIT)) {
      if (!record.poolVersion && (context.personal ? (record as LiveResult).sharedRoom === context.room : !(record as LiveResult).sharedRoom)) await tx.remove("gameresults", record._id);
    }
    return { ok: true, refunded: refund, roundNo, queued };
  });
}
