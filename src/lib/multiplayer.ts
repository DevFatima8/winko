import { createHash, randomUUID } from "node:crypto";
import { MULTIPLAYER_GAMES, type MultiplayerAction, type MultiplayerBet, type MultiplayerGame, type MultiplayerReply, type MultiplayerState } from "./multiplayer-types";
import { advanceCricketMatch, createOutcome, flightMs, grossPayout, multiplierAt, timings, validateOption, type BlastOutcome, type CricketMatch, type CricketOutcome, type MultiplayerOutcome } from "./multiplayer-rules";
import { mysqlMultiplayerStore, type MultiplayerStore, type MultiplayerTransaction } from "./multiplayer-store";
import { addPoolWager, closePoolWager, settleDailyPools, type PoolFields } from "./dailyPool";
import { DAILY_POOL_VERSION, dailyPoolLock } from "./dailyPoolRules";
import { dailyPoolEnabled } from "./dailyPoolConfig";
import { isCardGame } from "./cardGameRules";
import type { GameResultDoc } from "@/models";
import { isPrivateCardTable, privateCardPrize, privateCardOutcome, privateCardGross, PrivateCardError, type PrivateCardPrize } from "./privateCardTables";
import { isRouletteGame, isLiveRouletteGame } from "./rouletteGameRules";
import { privateRouletteOutcome, rouletteClaims, validRouletteAllocation } from "./privateRouletteTables";
import { nextPlayerWin } from "./playerWinCycle";

type Wallet = { _id: string; name: string; role: string; balance: number; isActive: boolean; blockedGames?: string[]; vipBetPoints?: number; updatedAt?: string };
type CatalogGame = { _id: string; slug: string; isActive: boolean };
type RoomBet = Omit<MultiplayerBet, "mine"> & { userId: string; cashoutMultiplier?: number; createdAt?: number; settledAt?: number };
type Room = {
  _id: string; gameId: string; game: MultiplayerGame; roundNo: number; startedAt: number;
  roundTimingVersion?: 1 | 2;
  outcome: MultiplayerOutcome; settled: boolean; bets: RoomBet[]; queuedBets: RoomBet[];
  history: { roundNo: number; result: MultiplayerOutcome }[];
  cricketMatch?: CricketMatch;
  ownerId?: string;
  cardPrize?: PrivateCardPrize;
  queuedCardPrize?: PrivateCardPrize;
  cardOption?: string;
  queuedCardOption?: string;
  cardOutcomeReady?: boolean;
};
type Receipt = { _id: string; fingerprint: string; reply: MultiplayerReply };
export class MultiplayerError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "MultiplayerError"; }
}
export function isMultiplayerGame(value: string): value is MultiplayerGame {
  return (MULTIPLAYER_GAMES as readonly string[]).includes(value);
}
const cents = (n: number) => Math.round(n * 100) / 100;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const mask = (name: string) => {
  const safe = Array.from(name.replace(/[\u0000-\u001f\u007f]/g, "").trim());
  return `${safe[0] ?? "P"}***${safe.length > 1 ? safe[safe.length - 1] : ""}`;
};
function deadlines(room: Room) {
  const t = timings(room.game, room.roundTimingVersion ?? 1), bettingEndsAt = room.startedAt + t.bettingMs;
  const resultAt = bettingEndsAt + (room.game === "blast-off" ? flightMs((room.outcome as BlastOutcome).crashPoint) : t.runningMs);
  return { bettingEndsAt, resultAt, endsAt: resultAt + t.resultMs };
}
function phase(room: Room, now: number) {
  const d = deadlines(room);
  return now < d.bettingEndsAt ? "betting" as const : now < d.resultAt ? "running" as const : "result" as const;
}
function validateAction(action: MultiplayerAction) {
  if (!action || !["bet", "cancel", "cashout"].includes(action.action) || typeof action.requestId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(action.requestId) || !Number.isSafeInteger(action.roundNo) || action.roundNo < 1) {
    throw new MultiplayerError("Invalid multiplayer action.");
  }
  if (action.betId !== undefined && (typeof action.betId !== "string" || action.betId.length > 100)) throw new MultiplayerError("Invalid bet id.");
}

/** Inject a transactional test store explicitly; production never falls back to local state. */
export function createMultiplayerService(store: MultiplayerStore = mysqlMultiplayerStore) {
  async function withRoom<T>(game: MultiplayerGame, userId: string | null, fn: (tx: MultiplayerTransaction, room: Room, user: Wallet | null, now: number, wallets: Map<string, Wallet>, catalog: CatalogGame) => Promise<T>): Promise<T> {
    if (!isMultiplayerGame(game)) throw new MultiplayerError("Unknown multiplayer game.", 404);
    return store.transact(dailyPoolLock(game), async tx => {
      await settleDailyPools(tx, game);
      let now = await tx.now();
      const games = await tx.find<CatalogGame>("games", "slug", game, 1);
      const catalog = games[0];
      if (!catalog) throw new MultiplayerError("Game is not available.", 404);
      const shared = await tx.get<Room>("multiplayerrooms", game, true);
      const personalGame = isPrivateCardTable(game) || isLiveRouletteGame(game);
      const legacy = personalGame && userId && shared &&
        [...shared.bets, ...shared.queuedBets].some(bet => bet.userId === userId && bet.status !== "cancelled");
      const ownerId = personalGame && userId && !legacy ? userId : null;
      const roomId = ownerId ? hash(`private-card:${game}:${ownerId}`) : game;
      let room = roomId === game ? shared : await tx.get<Room>("multiplayerrooms", roomId, true);
      if (!room) {
        room = { _id: roomId, gameId: catalog._id, game, roundNo: 1, startedAt: now, roundTimingVersion: 2, outcome: createOutcome(game), settled: false, bets: [], queuedBets: [], history: [], ...(ownerId ? { ownerId } : {}) };
      }
      // Same ordering across rooms prevents two multi-user settlements deadlocking.
      const ids = [...new Set([...(userId ? [userId] : []), ...room.bets.filter(b => b.status === "pending").map(b => b.userId), ...room.queuedBets.filter(b => b.status === "pending").map(b => b.userId)])].sort();
      if (ids.length > 2001) throw new Error("Multiplayer participant limit exceeded.");
      const wallets = new Map<string, Wallet>();
      for (const id of ids) {
        const wallet = await tx.get<Wallet>("users", id, true);
        if (!wallet) {
          if (id === userId) throw new MultiplayerError("Player account no longer exists.", 403);
          throw new Error("A reserved wager wallet is missing.");
        }
        if (!Number.isFinite(wallet.balance) || wallet.balance < 0) throw new Error("Invalid persisted wallet.");
        wallets.set(id, wallet);
      }
      const user = userId ? wallets.get(userId) ?? null : null;
      if (userId && (!user || user.role !== "client" || user.isActive === false || user.blockedGames?.includes(game))) {
        throw new MultiplayerError("You are not allowed to play this game.", 403);
      }
      now = await tx.now();
      const previous = JSON.stringify(room);
      for (const bets of [room.bets, room.queuedBets]) {
        if (!bets.some(bet => bet.poolPending && bet.status !== "pending")) continue;
        const results = await tx.findWhere<GameResultDoc & PoolFields>("gameresults", { gameId: room.gameId, roundNo: bets[0].roundNo }, 1000);
        const byId = new Map(results.map(result => [result._id, result]));
        for (const bet of bets) {
          if (!bet.poolPending || bet.status === "pending") continue;
          const result = byId.get(hash(`result:${bet.id}`));
          if (!result) throw new Error("Daily-pool multiplayer result missing.");
          if (result.poolPending === false) Object.assign(bet, { payout: result.winAmount, poolPending: false, status: result.winAmount > 0 ? "win" : "lose" });
        }
      }
      await advance(tx, room, wallets, now);
      const reply = await fn(tx, room, user, now, wallets, catalog);
      if (previous !== JSON.stringify(room) || !await tx.get<Room>("multiplayerrooms", roomId)) await tx.put("multiplayerrooms", roomId, room);
      return reply;
    });
  }

  async function credit(tx: MultiplayerTransaction, room: Room, bet: RoomBet, wallets: Map<string, Wallet>, gross: number, now: number, allocation?: { payout: number; held: number }) {
    if (bet.status !== "pending") return;
    const user = wallets.get(bet.userId);
    if (!user) throw new Error("Reserved wager wallet is missing.");
    if (bet.poolVersion) {
      const id = hash(`result:${bet.id}`);
      const result = await tx.get<GameResultDoc & PoolFields>("gameresults", id);
      if (!result) throw new Error("Daily-pool wager record missing.");
      const claim = cents(Math.max(0, gross));
      await closePoolWager(tx, id, claim);
      bet.payout = 0;
      bet.poolClaim = claim;
      bet.settledAt = now;
      bet.status = claim > 0 ? "win" : "lose";
      Object.assign(result, {
        winAmount: 0, outcome: claim > 0 ? "win" : "lose", poolClaim: claim,
        resultData: JSON.stringify({ game: room.game, option: bet.option, result: room.game === "blast-off" && now < deadlines(room).resultAt ? null : room.outcome, provisionalClaim: claim, cashoutMultiplier: bet.cashoutMultiplier ?? null }),
        updatedAt: new Date(now),
      });
      user.vipBetPoints = cents((user.vipBetPoints ?? 0) + bet.amount);
      user.updatedAt = new Date(now).toISOString();
      await tx.put("users", user._id, user);
      await tx.put("gameresults", id, result);
      return;
    }
    const push = gross === bet.amount && room.game === "speed-baccarat" && (bet.option === "player" || bet.option === "banker");
    const payout = allocation?.payout ?? (push ? gross : Math.floor(Math.max(0, gross) * 0.98 * 100 + 1e-8) / 100);
    const held = allocation?.held ?? (push ? 0 : cents(Math.max(0, gross) * 0.02));
    if (!Number.isFinite(payout) || !Number.isFinite(held)) throw new Error("Invalid settlement amount.");
    bet.payout = payout;
    bet.settledAt = now;
    bet.status = payout > 0 ? "win" : "lose";
    user.balance = cents(user.balance + payout);
    user.vipBetPoints = cents((user.vipBetPoints ?? 0) + bet.amount);
    user.updatedAt = new Date(now).toISOString();
    await tx.put("users", user._id, user);
    if (held > 0) {
      const id = hash(`hold:${bet.id}`);
      await tx.insert("winholds", id, { _id: id, userId: user._id, amount: held, unlockAt: new Date(now).toISOString(), claimed: false, claimedAt: null, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
    }
    const id = hash(`result:${bet.id}`);
    await tx.insert("gameresults", id, {
      _id: id, gameId: room.gameId, userId: user._id, roundNo: bet.roundNo, betSlot: room.bets.indexOf(bet),
      betAmount: bet.amount, winAmount: payout, outcome: payout > 0 ? "win" : "lose",
      resultData: JSON.stringify({ game: room.game, option: bet.option, result: room.game === "blast-off" && now < deadlines(room).resultAt ? null : room.outcome, grossPayout: gross, cashoutMultiplier: bet.cashoutMultiplier ?? null }),
      createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    });
  }

  async function settleAutos(tx: MultiplayerTransaction, room: Room, wallets: Map<string, Wallet>, now: number) {
    if (room.game !== "blast-off") return;
    const d = deadlines(room), crash = (room.outcome as BlastOutcome).crashPoint;
    for (const bet of room.bets) {
      if (bet.status !== "pending" || bet.autoCashout === undefined || bet.autoCashout >= crash) continue;
      const targetAt = d.bettingEndsAt + flightMs(bet.autoCashout);
      if (now < targetAt) continue;
      bet.cashoutMultiplier = bet.autoCashout;
      await credit(tx, room, bet, wallets, cents(bet.amount * bet.autoCashout), targetAt);
    }
  }
  async function advance(tx: MultiplayerTransaction, room: Room, wallets: Map<string, Wallet>, now: number) {
    // At most current + queued round can contain wagers; skip only empty overdue rounds.
    for (let pass = 0; pass < 4; pass++) {
      const d = deadlines(room);
      if (room.ownerId && now >= d.bettingEndsAt && !room.cardOutcomeReady) {
        const pending = room.bets.filter(bet => bet.status === "pending");
        if (pending.length) {
          if (room.game === "auto-roulette" || room.game === "lightning-roulette") {
            const win = await nextPlayerWin(tx, room.game, room.ownerId);
            room.outcome = privateRouletteOutcome(room.game, pending, win);
          } else {
            if (room.cardPrize === undefined) throw new Error("Private card wager is missing its assigned slot.");
            room.outcome = privateCardOutcome(room.game, pending[0].option, room.cardPrize);
          }
        }
        room.cardOutcomeReady = true;
      }
      await settleAutos(tx, room, wallets, now);
      if (now >= d.resultAt && !room.settled) {
        if (room.game === "nine-wickets") {
          room.cricketMatch = advanceCricketMatch((room.outcome as CricketOutcome).outcome, room.cricketMatch);
          (room.outcome as CricketOutcome).match = room.cricketMatch;
        }
        const groups = new Map<string, { amount: number; gross: number; payout: number; held: number }>();
        const rouletteBets = room.ownerId && isLiveRouletteGame(room.game) ? room.bets.filter(bet => bet.status === "pending") : [];
        const rouletteReturns = room.game === "auto-roulette" || room.game === "lightning-roulette"
          ? rouletteClaims(room.game, rouletteBets, room.outcome as import("./multiplayer-rules").RouletteOutcome) : [];
        for (const bet of room.bets) {
          if (bet.status !== "pending") continue;
          const key = `${bet.userId}:${bet.option}:${bet.poolVersion ?? "legacy"}`;
          const previous = groups.get(key) ?? { amount: 0, gross: 0, payout: 0, held: 0 };
          const amount = cents(previous.amount + bet.amount);
          const gross = rouletteBets.length
            ? cents(previous.gross + rouletteReturns[rouletteBets.indexOf(bet)])
            : room.ownerId ? privateCardGross(room.game, bet.option, amount, room.outcome) : grossPayout(room.game, bet.option, amount, room.outcome);
          const push = room.game === "speed-baccarat" && gross === amount && (bet.option === "player" || bet.option === "banker");
          const payout = push ? gross : Math.floor(gross * 0.98 * 100 + 1e-8) / 100;
          const held = push ? 0 : cents(gross * 0.02);
          // Match the source's aggregated spot payout, even for many small chip requests.
          await credit(tx, room, bet, wallets, cents(gross - previous.gross), d.resultAt, { payout: cents(payout - previous.payout), held: cents(held - previous.held) });
          groups.set(key, { amount, gross, payout, held });
        }
        room.settled = true;
        room.history = [{ roundNo: room.roundNo, result: room.outcome }, ...room.history].slice(0, 40);
      }
      if (now < d.endsAt) return;
      room.roundNo++;
      room.startedAt = d.endsAt;
      room.roundTimingVersion = 2;
      room.bets = room.queuedBets;
      room.queuedBets = [];
      room.outcome = createOutcome(room.game);
      room.cardOutcomeReady = false;
      delete room.cardPrize;
      delete room.cardOption;
      if (room.ownerId) {
        room.cardPrize = room.queuedCardPrize;
        room.cardOption = room.queuedCardOption;
        delete room.queuedCardPrize;
        delete room.queuedCardOption;
      }
      room.settled = false;
      if (!room.bets.some(b => b.status === "pending") && now >= deadlines(room).endsAt) {
        const duration = deadlines(room).endsAt - room.startedAt;
        // Empty rounds have no liabilities; keep the deadline anchor across idle gaps.
        const skipped = Math.floor((now - room.startedAt) / duration);
        room.roundNo += skipped;
        room.startedAt += skipped * duration;
        room.bets = [];
      }
    }
    throw new Error("Multiplayer catchup limit exceeded.");
  }
  function snapshot(room: Room, user: Wallet | null, now: number): MultiplayerState<MultiplayerOutcome> {
    const currentPhase = phase(room, now), d = deadlines(room);
    const visible = currentPhase === "result" || currentPhase === "running" && ["auto-roulette", "lightning-roulette", "dream-catcher", "32-cards", "baccarat"].includes(room.game);
    const publicBet = (bet: RoomBet): MultiplayerBet => ({
      id: bet.id, name: bet.name, option: bet.option, amount: bet.amount, roundNo: bet.roundNo,
      status: bet.status, payout: bet.payout, mine: bet.userId === user?._id,
      ...(bet.poolVersion ? { poolVersion: bet.poolVersion, poolPending: bet.poolPending, poolClaim: bet.poolClaim } : {}),
      ...(bet.autoCashout !== undefined && bet.userId === user?._id ? { autoCashout: bet.autoCashout } : {}),
      ...(bet.status === "win" && bet.cashoutMultiplier !== undefined ? { cashoutMultiplier: bet.cashoutMultiplier } : {}),
    });
    const bets = room.bets.map(publicBet), queuedBets = room.queuedBets.map(publicBet);
    // Flight deadlines are private: revealing a precise resultAt predicts the crash.
    const hiddenCrash = room.game === "blast-off" && currentPhase !== "result";
    return {
      game: room.game, tableMode: room.ownerId ? "personal" : "shared", serverNow: now, balance: user?.balance ?? null,
      round: { roundNo: room.roundNo, phase: currentPhase, bettingEndsAt: d.bettingEndsAt,
        resultAt: hiddenCrash ? 0 : d.resultAt,
        endsAt: hiddenCrash ? 0 : d.endsAt,
        result: visible ? room.outcome : null,
        ...(room.game === "blast-off" && currentPhase === "running" ? { multiplier: Math.floor(multiplierAt((now - d.bettingEndsAt) / 1000) * 100) / 100 } : {}),
      },
      bets, queuedBets, myBets: bets.filter(b => b.mine), myQueuedBets: queuedBets.filter(b => b.mine),
      history: room.history,
    };
  }
  return {
    read(game: MultiplayerGame, userId: string | null = null) {
      return withRoom(game, userId, async (_tx, room, user, now) => snapshot(room, user, now));
    },
    act(game: MultiplayerGame, userId: string, action: MultiplayerAction): Promise<MultiplayerReply> {
      validateAction(action);
      if (!userId) throw new MultiplayerError("Login is required.", 401);
      return withRoom(game, userId, async (tx, room, user, now, wallets, catalog) => {
        if (!user) throw new MultiplayerError("Login is required.", 401);
        const requestKey = hash(`${game}:${userId}:${action.requestId}`);
        const fingerprint = JSON.stringify([action.action, action.roundNo, action.option ?? null, action.amount ?? null, action.autoCashout ?? null, action.betId ?? null]);
        const receipt = await tx.get<Receipt>("multiplayerrequests", requestKey);
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) throw new MultiplayerError("Request id has already been used for a different action.", 409);
          return receipt.reply;
        }
        const d = deadlines(room), open = now < d.bettingEndsAt;
        let queued = false;
        if (action.action === "bet") {
          if ((isPrivateCardTable(game) || isLiveRouletteGame(game)) && !room.ownerId) throw new MultiplayerError("Finish the previously accepted shared round, then refresh to start your personal table.", 409);
          // Keep the accepted contract on old poolVersion wagers, not the current global flag.
          const poolMode = dailyPoolEnabled() && !isCardGame(game) && !isRouletteGame(game);
          if (poolMode && action.poolRulesVersion !== DAILY_POOL_VERSION) throw new MultiplayerError("Read and accept the daily-pool rules before placing a new bet.");
          if (!catalog.isActive) throw new MultiplayerError("Game is currently disabled.", 403);
          if (!open && (isCardGame(game) || isRouletteGame(game))) throw new MultiplayerError("Betting is closed. Wait for the next round to begin.", 409);
          const expectedRound = room.roundNo + (open ? 0 : 1);
          if (action.roundNo !== expectedRound) throw new MultiplayerError("Round changed. Refresh the live table before betting.", 409);
          if (typeof action.option !== "string" || !validateOption(game, action.option)) throw new MultiplayerError("Invalid bet option.");
          const amount = action.amount;
          if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 10 || Math.abs(cents(amount) - amount) > 1e-8) throw new MultiplayerError("Bet must be at least 10, with at most two decimals.");
          if (action.autoCashout !== undefined && (game !== "blast-off" || !Number.isFinite(action.autoCashout) || action.autoCashout < 1.01 || action.autoCashout > 250 || Math.abs(cents(action.autoCashout) - action.autoCashout) > 1e-8)) throw new MultiplayerError("Auto cashout must be between 1.01 and 250.");
          queued = !open;
          const target = queued ? room.queuedBets : room.bets;
          if (room.ownerId && (game === "auto-roulette" || game === "lightning-roulette")) {
            if (!validRouletteAllocation(game, [...target.filter(bet => bet.status === "pending"), { option: action.option, amount }])) {
              throw new MultiplayerError("These bets cover every result or cannot produce a profitable win. Leave both a winning and a zero-return outcome available.", 409);
            }
          } else if (room.ownerId) {
            const optionKey = queued ? "queuedCardOption" : "cardOption";
            const prizeKey = queued ? "queuedCardPrize" : "cardPrize";
            if (room[optionKey] && room[optionKey] !== action.option) throw new MultiplayerError("Choose one betting spot per personal round. The chosen spot stays fixed until that round ends, including after cancellation.", 409);
            if (room[prizeKey] === undefined) {
              try {
                room[prizeKey] = await privateCardPrize(tx, game, userId, action.option);
                room[optionKey] = action.option;
              }
              catch (error) {
                if (error instanceof PrivateCardError) throw new MultiplayerError(error.message, 409);
                throw error;
              }
            }
          }
          if (target.length >= 1000 || target.filter(b => b.userId === userId && b.status === "pending").length >= 100) throw new MultiplayerError("Table bet limit reached.", 429);
          if (user.balance < amount) throw new MultiplayerError("Insufficient balance.", 409);
          if ((isCardGame(game) || isRouletteGame(game)) && await tx.now() >= d.bettingEndsAt) throw new MultiplayerError("Betting closed while processing. Wait for the next round to begin.", 409);
          user.balance = cents(user.balance - amount);
          user.updatedAt = new Date(now).toISOString();
          await tx.put("users", userId, user);
          const bet: RoomBet = { id: randomUUID(), userId, name: mask(user.name), option: action.option, amount, roundNo: expectedRound, status: "pending", payout: 0, createdAt: now, ...(action.autoCashout !== undefined ? { autoCashout: action.autoCashout } : {}) };
          if (poolMode) {
            const id = hash(`result:${bet.id}`);
            const result: GameResultDoc = {
              _id: id, gameId: room.gameId, userId, roundNo: expectedRound, betSlot: target.length,
              betAmount: amount, winAmount: 0, outcome: "pending", resultData: `Daily pool wager: ${action.option}`,
              createdAt: new Date(now), updatedAt: new Date(now),
            };
            await addPoolWager(tx, game, result);
            await tx.insert("gameresults", id, result);
            Object.assign(bet, { poolVersion: DAILY_POOL_VERSION, poolPending: true, poolClaim: 0 });
          }
          target.push(bet);
        } else if (action.action === "cancel") {
          const current = action.roundNo === room.roundNo, next = action.roundNo === room.roundNo + 1;
          if (!(current && open || next)) throw new MultiplayerError("This round can no longer be cancelled.", 409);
          const list = current ? room.bets : room.queuedBets;
          const cancel = list.filter(b => b.userId === userId && b.status === "pending" && (!action.betId || b.id === action.betId));
          if (!cancel.length) throw new MultiplayerError("No cancellable wager found.", 409);
          if (room.ownerId && (game === "auto-roulette" || game === "lightning-roulette")) {
            const remaining = list.filter(bet => bet.status === "pending" && !cancel.includes(bet));
            if (remaining.length && !validRouletteAllocation(game, remaining)) {
              throw new MultiplayerError("That cancellation would leave incompatible covering bets. Clear the round's bets together instead.", 409);
            }
          }
          let refund = 0;
          for (const bet of cancel) {
            if (bet.poolVersion) {
              const resultId = hash(`result:${bet.id}`);
              await closePoolWager(tx, resultId, 0, true);
              await tx.remove("gameresults", resultId);
              bet.poolPending = false;
            }
            bet.status = "cancelled"; bet.settledAt = now; refund += bet.amount;
          }
          user.balance = cents(user.balance + refund);
          user.updatedAt = new Date(now).toISOString();
          await tx.put("users", userId, user);
        } else {
          if (game !== "blast-off" || action.roundNo !== room.roundNo || phase(room, now) !== "running") throw new MultiplayerError("Cashout is not available for this round.", 409);
          const cashouts = room.bets.filter(b => b.userId === userId && b.status === "pending" && (!action.betId || b.id === action.betId));
          if (!cashouts.length) throw new MultiplayerError("No active flight wager found.", 409);
          const multiple = Math.floor(multiplierAt((now - d.bettingEndsAt) / 1000) * 100) / 100;
          for (const bet of cashouts) {
            bet.cashoutMultiplier = multiple;
            await credit(tx, room, bet, wallets, cents(bet.amount * multiple), now);
          }
        }
        const reply: MultiplayerReply = { ok: true, roundNo: action.roundNo, ...(action.action === "bet" ? { queued } : {}) };
        await tx.insert("multiplayerrequests", requestKey, { _id: requestKey, userId, game, createdAt: now, fingerprint, reply });
        return reply;
      });
    },
  };
}
export const multiplayer = createMultiplayerService();
