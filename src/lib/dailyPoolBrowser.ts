import { createHash, randomInt } from "node:crypto";
import type { GameDoc, GameResultDoc, UserDoc } from "@/models";
import type { MultiplayerTransaction } from "./multiplayer-store";
import { addPoolWager, cents, closePoolWager, settleDailyPools, type PoolFields, type PoolEntry } from "./dailyPool";
import { DAILY_POOL_VERSION, type DailyPoolGame } from "./dailyPoolRules";
import { isBrowserPoolGame } from "./dailyPoolBrowserGames";
import { isDailyPoolGame } from "./dailyPoolRules";
import { nextBetWin, nextPlayerPrize, nextPlayerWin } from "./playerWinCycle";
import { isCardGame } from "./cardGameRules";
import { BROWSER_ROULETTE_GAMES, isRouletteGame, isBrowserRouletteGame } from "./rouletteGameRules";
import { isInteractiveBrowserCardGame, isServerBrowserCardGame, SERVER_BROWSER_CARD_GAMES } from "./browserCardGames";
import { BrowserCardSelectionError, serverCardOutcome } from "./browserCardOutcome";
import { isSlotGame, SLOT_GROSS_CAP } from "./slotGameRules";
export { BROWSER_POOL_GAMES, isBrowserPoolGame } from "./dailyPoolBrowserGames";

export class BrowserWagerError extends Error {}

type LifecycleResult = GameResultDoc & PoolFields & {
  browserGame: string; browserStatus: "active" | "closed" | "refunded";
  browserTotalStake: number;
  browserGrossClaim?: number;
  browserCompletedClaim?: number;
  browserParts?: string[];
  browserServerInput?: string; browserOutcome?: unknown;
  browserServerRequired?: boolean;
  browserCardState?: unknown;
  browserOperations: Record<string, { action: string; amount: number }>;
};

export async function browserPoolLifecycle(tx: MultiplayerTransaction, userId: string, input: {
  game: string; wagerId: string; operationId: string; action: "accept" | "increment" | "complete" | "refund" | "award" | "reduce";
  amount: number; poolVersion?: string;
}, enabled = true, verified = false) {
  enabled = enabled && !isCardGame(input.game) && !isRouletteGame(input.game) && !isSlotGame(input.game) && input.game !== "thai-hi-lo";
  if (!isDailyPoolGame(input.game) || !isBrowserPoolGame(input.game)) throw new BrowserWagerError("This browser lifecycle is not enabled for this game.");
  if (!/^[a-f0-9-]{36}$/i.test(input.wagerId) || !/^[a-f0-9-]{36}$/i.test(input.operationId)) throw new BrowserWagerError("Valid wager and operation identities are required.");
  const amount = input.amount;
  if (!Number.isFinite(amount) || amount < 0 || cents(amount) / 100 !== amount ||
      amount > Number.MAX_SAFE_INTEGER / 100 || (input.action === "accept" || input.action === "increment") && amount <= 0) throw new BrowserWagerError("Invalid lifecycle amount.");
  if (input.action === "refund" && amount !== 0) throw new BrowserWagerError("A refund returns only the accepted stake.");
  await settleDailyPools(tx, input.game);
  const id = createHash("sha256").update(`browser-active:${userId}:${input.game}:${input.wagerId}`).digest("hex");
  let result = await tx.get<LifecycleResult>("gameresults", id);
  if (serverGame(input.game) && ["complete", "award"].includes(input.action) && !verified &&
      !((input.game === "thai-hi-lo" || isSlotGame(input.game) || isServerBrowserCardGame(input.game) || isBrowserRouletteGame(input.game)) && result && !result.browserServerRequired)) {
    throw new BrowserWagerError("Server outcome verification is required.");
  }
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user || !Number.isFinite(user.balance)) throw new Error("Player wallet unavailable.");
  const operation = result?.browserOperations[input.operationId];
  if (operation) {
    if (operation.action !== input.action || operation.amount !== amount) throw new BrowserWagerError("Operation identity was reused with different values.");
    return { ok: true, balance: user.balance, wagerId: input.wagerId, poolPending: result!.poolPending === true,
      claim: result!.browserCompletedClaim ?? result!.poolClaim ?? 0, status: result!.browserStatus, replay: true };
  }
  if (!verified && result?.browserServerRequired && result.browserCardState && isInteractiveBrowserCardGame(input.game) &&
      ["increment", "refund", "reduce"].includes(input.action)) {
    throw new BrowserWagerError("Use a verified table action for this dealt card wager.");
  }
  const now = new Date(await tx.now());
  if (input.game === "thai-hi-lo" && (input.action === "accept" || input.action === "increment") &&
      !Number.isSafeInteger((cents(amount) + (input.action === "increment" ? cents(result?.browserTotalStake ?? 0) : 0)) * 2)) {
    throw new BrowserWagerError("Thai Hi-Lo stake exceeds the supported wallet precision.");
  }
  if (isSlotGame(input.game) && (input.action === "accept" || input.action === "increment") &&
      !Number.isSafeInteger((cents(amount) + (input.action === "increment" ? cents(result?.browserTotalStake ?? 0) : 0)) * SLOT_GROSS_CAP)) {
    throw new BrowserWagerError("Slot stake exceeds the supported wallet precision.");
  }
  if (input.action === "accept") {
    if (result) throw new BrowserWagerError("This wager identity is already accepted.");
    if (amount < 10) throw new BrowserWagerError("Minimum bet is Rs. 10.");
    if (enabled && input.poolVersion !== DAILY_POOL_VERSION) throw new BrowserWagerError("Accept the current daily-pool rules before placing a new bet.");
    if (!user.isActive || user.role !== "client" || user.blockedGames?.includes(input.game)) throw new BrowserWagerError("This account cannot bet on this game.");
    const game = (await tx.findWhere<GameDoc>("games", { slug: input.game }, 1))[0];
    if (!game?.isActive) throw new BrowserWagerError("This game is not available for betting.");
    if (cents(user.balance) < cents(amount)) throw new BrowserWagerError("Insufficient balance.");
    result = {
      _id: id, gameId: game._id, userId, roundNo: null, betSlot: 0,
      betAmount: amount, winAmount: 0, outcome: "pending", resultData: enabled ? "Browser wager active | Daily pool" : "Browser wager active",
      browserGame: input.game, browserStatus: "active", browserOperations: {}, browserTotalStake: amount,
      ...(input.game === "thai-hi-lo" || isSlotGame(input.game) || isServerBrowserCardGame(input.game) || isBrowserRouletteGame(input.game) ? { browserServerRequired: true } : {}),
      createdAt: now, updatedAt: now,
    };
    if (enabled) await addPoolWager(tx, input.game, result);
    user.balance = (cents(user.balance) - cents(amount)) / 100;
  } else {
    if (!result || result.userId !== userId) throw new BrowserWagerError("Accepted wager not found.");
    if (result.browserStatus !== "active") throw new BrowserWagerError("This wager has already finished.");
    if (input.action === "refund" && (result.browserGrossClaim ?? 0) > 0) throw new BrowserWagerError("A wager with awarded results must finish before settlement.");
    const pooled = result.poolVersion === DAILY_POOL_VERSION;
    if (input.action === "increment") {
      if (amount < 10 && !verified) throw new BrowserWagerError("Minimum added stake is Rs. 10.");
      if ((enabled || pooled) && input.poolVersion !== DAILY_POOL_VERSION) throw new BrowserWagerError("Accept the current daily-pool rules before adding a stake.");
      if (enabled && !pooled) throw new BrowserWagerError("Finish the legacy wager before adding new pool stakes.");
      if (!user.isActive || user.role !== "client" || user.blockedGames?.includes(input.game)) throw new BrowserWagerError("This account cannot bet on this game.");
      const game = (await tx.findWhere<GameDoc>("games", { slug: input.game }, 1))[0];
      if (!game?.isActive) throw new BrowserWagerError("This game is not available for betting.");
      if (cents(user.balance) < cents(amount)) throw new BrowserWagerError("Insufficient balance.");
      // Each added stake has its own accepted-day ledger entry, never a retroactive day change.
      if (pooled) {
        const partId = `${id}:${input.operationId}`;
        const part: GameResultDoc = { ...result, _id: partId, betAmount: amount, createdAt: now, updatedAt: now };
        await addPoolWager(tx, input.game, part);
        await tx.insert("gameresults", partId, part);
        result.browserParts = [...result.browserParts ?? [], partId];
      } else result.betAmount = (cents(result.betAmount) + cents(amount)) / 100;
      result.browserTotalStake = (cents(result.browserTotalStake) + cents(amount)) / 100;
      user.balance = (cents(user.balance) - cents(amount)) / 100;
    } else if (input.action === "reduce") {
      if (amount <= 0 || cents(amount) > cents(result.browserTotalStake) || (result.browserGrossClaim ?? 0) > 0) throw new BrowserWagerError("Invalid stake cancellation.");
      if (pooled) {
        let remaining = cents(amount);
        for (const partId of [id, ...result.browserParts ?? []].reverse()) {
          if (!remaining) break;
          const entry = await tx.get<PoolEntry>("dailypoolentries", partId);
          if (!entry || entry.status !== "active") continue;
          const reduction = Math.min(remaining, entry.stakeCents);
          const cancelled = reduction === entry.stakeCents;
          if (cancelled) await closePoolWager(tx, partId, 0, true);
          else {
            const pool = await tx.get<{ _id: string; status: string; stakeCents: number; updatedAt: Date }>("dailypools", entry.poolId);
            if (!pool || pool.status !== "open") throw new Error("Stake cancellation ledger is inconsistent.");
            entry.stakeCents -= reduction;
            pool.stakeCents -= reduction;
            pool.updatedAt = now;
            await tx.put("dailypoolentries", partId, entry);
            await tx.put("dailypools", pool._id, pool);
          }
          const part = partId === id ? result : await tx.get<LifecycleResult>("gameresults", partId);
          if (!part) throw new Error("Stake result is missing.");
          part.betAmount = cancelled ? 0 : entry.stakeCents / 100;
          part.updatedAt = now;
          if (cancelled) part.poolPending = false;
          if (partId !== id) await tx.put("gameresults", partId, part);
          remaining -= reduction;
        }
        if (remaining) throw new Error("Stake cancellation did not reconcile.");
      } else result.betAmount = (cents(result.betAmount) - cents(amount)) / 100;
      result.browserTotalStake = (cents(result.browserTotalStake) - cents(amount)) / 100;
      if (result.browserTotalStake === 0) {
        result.browserStatus = "refunded";
        result.poolPending = false;
      }
      user.balance = (cents(user.balance) + cents(amount)) / 100;
    } else if (input.action === "award") {
      result.browserGrossClaim = (cents(result.browserGrossClaim ?? 0) + cents(amount)) / 100;
      if (!pooled) user.balance = (cents(user.balance) + cents(amount)) / 100;
    } else if (!pooled) {
      const credit = input.action === "refund" ? result.browserTotalStake : amount;
      user.balance = (cents(user.balance) + cents(credit)) / 100;
      result.winAmount = input.action === "refund" ? 0 : amount + (result.browserGrossClaim ?? 0);
      result.browserStatus = input.action === "refund" ? "refunded" : "closed";
      result.outcome = result.winAmount > result.browserTotalStake ? "win" : "lose";
      result.resultData = input.action === "refund" ? "Cancelled and refunded legacy wager" : "Legacy browser round completed";
      if (input.action === "refund") Object.assign(result, { betAmount: 0, winAmount: 0, outcome: "pending" });
    } else {
      const allEntries = await Promise.all([id, ...result.browserParts ?? []].map(part => tx.get<PoolEntry>("dailypoolentries", part)));
      if (allEntries.some(entry => !entry)) throw new Error("Wager stake ledger is incomplete.");
      const entries = allEntries.filter((entry): entry is PoolEntry => entry?.status === "active");
      const total = entries.reduce((sum, entry) => sum + entry.stakeCents, 0);
      if (total <= 0) throw new Error("No active stake remains.");
      let allocated = 0;
      const claimCents = cents(amount) + cents(result.browserGrossClaim ?? 0);
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]!;
        const share = input.action === "refund" ? 0 : index === entries.length - 1 ? claimCents - allocated : Number(BigInt(claimCents) * BigInt(entry.stakeCents) / BigInt(total));
        allocated += share;
        await closePoolWager(tx, entry._id, share / 100, input.action === "refund");
        if (entry._id !== id) {
          const part = await tx.get<GameResultDoc>("gameresults", entry._id);
          if (!part) throw new Error("Wager result is incomplete.");
          Object.assign(part, { poolClaim: share / 100, poolPending: input.action !== "refund", outcome: input.action === "refund" ? "pending" : share ? "win" : "lose", updatedAt: now });
          if (input.action === "refund") Object.assign(part, { betAmount: 0, winAmount: 0, resultData: "Cancelled and refunded" });
          await tx.put("gameresults", entry._id, part);
        } else result.poolClaim = share / 100;
      }
      // Keep the root result's stake equal to its ledger entry for settlement reconciliation.
      result.betAmount = allEntries[0]!.status === "active" ? allEntries[0]!.stakeCents / 100 : 0;
      result.browserStatus = input.action === "refund" ? "refunded" : "closed";
      result.poolPending = input.action !== "refund";
      result.outcome = claimCents > 0 && input.action === "complete" ? "win" : "lose";
      result.resultData = input.action === "refund" ? "Cancelled and refunded" : "Provisional claim | Pending daily pool settlement";
      if (input.action === "refund") Object.assign(result, { betAmount: 0, winAmount: 0, outcome: "pending" });
      if (input.action === "refund") user.balance = (cents(user.balance) + total) / 100;
    }
  }
  if (input.action === "complete") result.browserCompletedClaim = (cents(amount) + cents(result.browserGrossClaim ?? 0)) / 100;
  result.browserOperations[input.operationId] = { action: input.action, amount };
  cents(user.balance);
  result.updatedAt = now;
  user.updatedAt = now;
  await tx.put("users", userId, user);
  await tx.put("gameresults", id, result);
  return { ok: true, balance: user.balance, wagerId: input.wagerId, poolPending: result.poolPending === true,
    claim: result.browserCompletedClaim ?? result.poolClaim ?? 0, status: result.browserStatus, replay: false };
}

type BrowserResult = GameResultDoc & PoolFields & {
  browserWagerId: string; browserStake: number; browserClaim: number;
  browserServerInput?: string; browserOutcome?: unknown;
};

export const SERVER_BROWSER_POOL_GAMES = ["head-tail", "wheel-betting", "ludo", "birds-beasts", "treasure-bowl", "super-fruits", "sweet-bonanza", "fortune-ox", "fortune-gems", "fortune-toucan", "gates-of-olympus", "diao-chan", "hotline", "thai-hi-lo", ...SERVER_BROWSER_CARD_GAMES, ...BROWSER_ROULETTE_GAMES] as const;
const serverGame = (game: string) => SERVER_BROWSER_POOL_GAMES.some(value => value === game) || isServerBrowserCardGame(game);

function validateSlotClaim(game: string, stake: number, claim: number) {
  if (isSlotGame(game) && (!Number.isFinite(claim) || claim < 0 ||
      cents(claim) > cents(stake * SLOT_GROSS_CAP))) {
    throw new Error("Server slot return exceeds the accepted wager limit.");
  }
}

export async function resolveServerBrowserWager(tx: MultiplayerTransaction, userId: string, input: {
  game: string; wagerId: string; operationId: string; selection?: unknown;
}, enabled: boolean) {
  if (!isDailyPoolGame(input.game) || !serverGame(input.game)) throw new BrowserWagerError("Unsupported server browser engine.");
  if (isInteractiveBrowserCardGame(input.game)) throw new BrowserWagerError("Continue this wager using its card table actions.");
  await settleDailyPools(tx, input.game);
  const id = createHash("sha256").update(`browser-active:${userId}:${input.game}:${input.wagerId}`).digest("hex");
  const result = await tx.get<LifecycleResult>("gameresults", id);
  if (!result || result.userId !== userId) throw new BrowserWagerError("Accepted server wager not found.");
  const selection = JSON.stringify(input.selection ?? {});
  if (selection.length > 8000) throw new BrowserWagerError("Invalid outcome selection.");
  if (result.browserServerInput && result.browserServerInput !== selection) throw new BrowserWagerError("Wager outcome selection cannot change.");
  if (result.browserOutcome) {
    const user = await tx.get<UserDoc>("users", userId, true);
    if (!user) throw new Error("Wallet unavailable.");
    return { ok: true, wagerId: input.wagerId, balance: user.balance, outcome: result.browserOutcome,
      poolPending: result.poolPending === true, claim: result.browserCompletedClaim ?? result.poolClaim ?? 0, status: result.browserStatus, replay: true };
  }
  if (result.browserStatus !== "active") throw new BrowserWagerError("This wager already finished.");
  const resolved = await serverOutcome(tx, userId, input.game, result.browserTotalStake, input.selection);
  validateSlotClaim(input.game, result.browserTotalStake, resolved.claim);
  const reply = await browserPoolLifecycle(tx, userId, { ...input, action: "complete", amount: resolved.claim }, enabled, true);
  const completed = await tx.get<LifecycleResult>("gameresults", id);
  if (!completed) throw new Error("Server result missing.");
  completed.browserServerInput = selection;
  completed.browserOutcome = resolved.outcome;
  await tx.put("gameresults", id, completed);
  return { ...reply, outcome: resolved.outcome };
}

async function serverOutcome(tx: MultiplayerTransaction, userId: string, game: string, stake: number, selection: unknown) {
  const input = (selection && typeof selection === "object" ? selection : {}) as Record<string, unknown>;
  if (game === "thai-hi-lo") {
    const rules = await import("@/components/thai-hi-lo/lib/hi-lo");
    const option = rules.BET_OPTIONS.find(option => option.id === input.bet);
    if (!option) throw new BrowserWagerError("Select a valid Thai Hi-Lo betting side.");
    if (!Number.isSafeInteger(cents(stake) * 2)) throw new BrowserWagerError("Thai Hi-Lo stake exceeds the supported wallet precision.");
    const won = await nextPlayerWin(tx, game, userId);
    const choices = rules.ALL_COMBOS.filter(dice => rules.isWin(option.id, dice) === won);
    const dice = choices[randomInt(choices.length)];
    const payout = won ? cents(stake * 2) / 100 : 0;
    return { claim: payout, outcome: { dice, won, payout } };
  }
  if (["fortune-ox", "fortune-gems", "fortune-toucan", "gates-of-olympus", "diao-chan"].includes(game)) {
    const { serverSlotOutcome, BrowserSlotSelectionError } = await import("./browserSlotOutcome");
    try { return await serverSlotOutcome(tx, userId, game, stake, selection); }
    catch (error) {
      if (error instanceof BrowserSlotSelectionError) throw new BrowserWagerError(error.message);
      throw error;
    }
  }
  if (game === "hotline") {
    const colors = ["red", "black", "fire"] as const;
    if (!colors.some(color => color === input.color) || typeof input.highRisk !== "boolean") {
      throw new BrowserWagerError("Select a valid Hotline colour and mode.");
    }
    const won = await nextBetWin(tx, game, 30);
    const alternatives = colors.filter(color => color !== input.color);
    const color = won ? input.color : alternatives[randomInt(alternatives.length)];
    const multiplier = won ? Math.min(SLOT_GROSS_CAP, color === "fire" ? (input.highRisk ? 18 : 10) : input.highRisk ? 2.1 : 1.95) : 0;
    const payout = cents(stake * multiplier) / 100;
    return { claim: payout, outcome: { color, won, multiplier, amount: payout, payout } };
  }
  if (isBrowserRouletteGame(game)) {
    const { serverBrowserRouletteOutcome, BrowserRouletteSelectionError } = await import("./browserRouletteOutcome");
    try { return await serverBrowserRouletteOutcome(tx, userId, game, stake, selection); }
    catch (error) {
      if (error instanceof BrowserRouletteSelectionError) throw new BrowserWagerError(error.message);
      throw error;
    }
  }
  if (game === "poker") {
    const engine = await import("@/components/poker/lib/poker");
    const round = engine.dealRound(await nextPlayerWin(tx, game, userId));
    const payout = round.playerWins ? cents(stake * (1 + engine.PAYOUTS[round.playerScore.category])) / 100 : 0;
    return { claim: payout, outcome: { ...round, payout } };
  }
  if (isServerBrowserCardGame(game)) {
    try { return await serverCardOutcome(tx, userId, game, stake, selection); }
    catch (error) {
      if (error instanceof BrowserCardSelectionError) throw new BrowserWagerError(error.message);
      throw error;
    }
  }
  if (game === "super-fruits") {
    const rules = await import("@/components/super-fruits-slot/lib/slots");
    const fruit = await nextPlayerPrize(tx, game, userId,
      ["cherry", "cherry", "cherry", "cherry", "cherry", "lemon", "lemon", "lemon", "orange", "orange"] as const);
    const spin = rules.generateSpin(fruit !== null, fruit ?? undefined);
    const payout = fruit ? Math.min(cents(stake * SLOT_GROSS_CAP) / 100, rules.payoutFor(fruit, stake)) : 0;
    return { claim: payout, outcome: { ...spin, payout } };
  }
  if (game === "sweet-bonanza") {
    const won = await nextPlayerWin(tx, game, userId);
    const multiplier = won ? [1.2, 1.4, 1.6][randomInt(3)] : 0;
    const payout = cents(stake * multiplier) / 100;
    return { claim: payout, outcome: { won, multiplier, payout } };
  }
  if (game === "treasure-bowl") {
    const isWin = await nextPlayerWin(tx, game, userId);
    const isHuge = isWin && randomInt(10) === 0;
    const symbols = ["coin", "lantern", "peach", "jade", "ingot", "bowl"];
    let finalReels = isWin
      ? isHuge ? Array<string>(9).fill("bowl") : ["ingot", "ingot", "ingot", "jade", "coin", "lantern", "peach", "coin", "jade"]
      : Array.from({ length: 9 }, () => symbols[randomInt(symbols.length)]);
    if (!isWin) {
      const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [2, 4, 6]];
      for (let attempt = 0; lines.some(line => line.every(index => finalReels[index] === finalReels[line[0]])); attempt++) {
        if (attempt === 100) throw new Error("Unable to generate a non-winning Treasure Bowl result.");
        finalReels = Array.from({ length: 9 }, () => symbols[randomInt(symbols.length)]);
      }
    }
    const multiplier = isWin ? SLOT_GROSS_CAP : 0;
    const payout = cents(stake * multiplier) / 100;
    return { claim: payout, outcome: { isWin, isHuge, finalReels, payout } };
  }
  if (game === "head-tail") {
    const rules = await import("@/components/head-tail/lib/game");
    if (!rules.isSide(input.choice) || stake < rules.MIN_BET) throw new BrowserWagerError("Invalid heads-or-tails wager.");
    const win = randomInt(1000) < rules.WIN_CHANCE * 1000;
    return { claim: win ? cents(stake * rules.PAYOUT_MULTIPLIER) / 100 : 0,
      outcome: { win, result: win ? input.choice : rules.otherSide(input.choice) } };
  }
  if (game === "wheel-betting") {
    const rules = await import("@/components/wheel-betting/lib/wheel");
    const engine = await import("@/components/wheel-betting/lib/spin-engine");
    if (stake < rules.MIN_BET) throw new BrowserWagerError("Invalid wheel wager.");
    const outcome = engine.spin(stake, typeof input.clientSeed === "string" ? input.clientSeed : undefined);
    return { claim: outcome.payout, outcome };
  }
  if (game === "ludo") {
    const engine = await import("./ludo");
    if (!engine.isValidBet(stake)) throw new BrowserWagerError("Invalid Ludo wager.");
    const outcome = engine.createDeal(stake, Math.floor(Math.random() * 2147483646) + 1);
    return { claim: cents(engine.settlementFor(outcome, 0).total + stake) / 100, outcome };
  }
  if (game === "birds-beasts") {
    const rules = await import("@/components/birds-beasts/lib/game-config");
    const { resolveBirdsBeastsRound } = await import("./birdsBeastsRounds");
    const raw = input.bets;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BrowserWagerError("Invalid animal wager.");
    const bets: import("@/components/birds-beasts/lib/game-config").Bets = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!rules.isBetKey(key) || typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new BrowserWagerError("Invalid animal wager.");
      bets[key] = value;
    }
    if (cents(rules.totalOf(bets)) !== cents(stake)) throw new BrowserWagerError("Animal stakes do not match the accepted wager.");
    return resolveBirdsBeastsRound(tx, bets);
  }
  throw new BrowserWagerError("Unsupported server browser engine.");
}

export async function playServerBrowserWager(tx: MultiplayerTransaction, userId: string, input: {
  game: string; wagerId: string; stake: number; poolVersion?: string; selection?: unknown;
}, enabled: boolean) {
  if (!serverGame(input.game)) throw new BrowserWagerError("Unsupported server browser engine.");
  const id = createHash("sha256").update(`browser:${userId}:${input.game}:${input.wagerId}`).digest("hex");
  const existing = await tx.get<BrowserResult>("gameresults", id);
  const selection = JSON.stringify(input.selection ?? {});
  if (selection.length > 8000) throw new BrowserWagerError("Invalid outcome selection.");
  if (existing && existing.browserServerInput !== selection) throw new BrowserWagerError("Wager identity was already used with a different selection.");
  const resolved = existing ? { claim: existing.browserClaim, outcome: existing.browserOutcome }
    : await serverOutcome(tx, userId, input.game, input.stake, input.selection);
  if (!existing) validateSlotClaim(input.game, input.stake, resolved.claim);
  const reply = await playBrowserWager(tx, userId, { ...input, claim: resolved.claim }, enabled, { selection, outcome: resolved.outcome });
  return { ...reply, outcome: resolved.outcome };
}

export async function playBrowserWager(
  tx: MultiplayerTransaction,
  userId: string,
  input: { game: string; wagerId: string; stake: number; claim: number; poolVersion?: string },
  enabled: boolean,
  verified?: { selection: string; outcome: unknown },
) {
  enabled = enabled && !isCardGame(input.game) && !isRouletteGame(input.game) && !isSlotGame(input.game) && input.game !== "thai-hi-lo";
  if (!isBrowserPoolGame(input.game)) throw new BrowserWagerError("Daily-pool betting is not supported for this browser game yet.");
  if (serverGame(input.game) && !verified) throw new BrowserWagerError("This game's outcome must be generated by its server engine.");
  if (!/^[a-f0-9-]{36}$/i.test(input.wagerId)) throw new BrowserWagerError("A valid accepted-wager identity is required.");
  if (!Number.isFinite(input.stake) || input.stake <= 0 || input.stake > Number.MAX_SAFE_INTEGER / 100 ||
      !Number.isFinite(input.claim) || input.claim < 0 || input.claim > Number.MAX_SAFE_INTEGER / 100 ||
      cents(input.stake) / 100 !== input.stake || cents(input.claim) / 100 !== input.claim) {
    throw new BrowserWagerError("Invalid browser wager amounts.");
  }
  const id = createHash("sha256").update(`browser:${userId}:${input.game}:${input.wagerId}`).digest("hex");
  await settleDailyPools(tx, input.game as DailyPoolGame);
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user || !Number.isFinite(user.balance)) throw new Error("Player wallet unavailable.");
  const existing = await tx.get<BrowserResult>("gameresults", id);
  if (existing) {
    if (existing.userId !== userId || existing.browserWagerId !== input.wagerId ||
        existing.browserStake !== input.stake || existing.browserClaim !== input.claim) {
      throw new BrowserWagerError("Wager identity was already used with different amounts.");
    }
    return { ok: true, balance: user.balance, wagerId: input.wagerId, poolPending: existing.poolPending === true,
      poolVersion: existing.poolVersion, claim: existing.browserClaim, replay: true };
  }
  if (input.stake < 10) throw new BrowserWagerError("Minimum bet is Rs. 10.");
  if (enabled && input.poolVersion !== DAILY_POOL_VERSION) throw new BrowserWagerError("Accept the current daily-pool rules before placing a new bet.");
  if (!user.isActive || user.role !== "client" || user.blockedGames?.includes(input.game)) throw new BrowserWagerError("This account cannot bet on this game.");
  const game = (await tx.findWhere<GameDoc>("games", { slug: input.game }, 1))[0];
  if (!game?.isActive) throw new BrowserWagerError("This game is not available for betting.");
  if (cents(user.balance) < cents(input.stake)) throw new BrowserWagerError("Insufficient balance.");
  const now = new Date(await tx.now());
  const result: BrowserResult = {
    _id: id, gameId: game._id, userId, roundNo: null, betSlot: 0,
    betAmount: input.stake, winAmount: enabled ? 0 : input.claim,
    outcome: input.claim > 0 ? "win" : "lose",
    resultData: enabled ? "Browser round completed | Provisional claim; pending daily pool settlement" : "Browser round completed",
    browserWagerId: input.wagerId, browserStake: input.stake, browserClaim: input.claim,
    ...(verified ? { browserServerInput: verified.selection, browserOutcome: verified.outcome } : {}),
    createdAt: now, updatedAt: now,
  };
  if (enabled) {
    const gameSlug = input.game as DailyPoolGame;
    await addPoolWager(tx, gameSlug, result);
    await closePoolWager(tx, id, input.claim);
    result.poolClaim = input.claim;
  }
  const balanceCents = cents(user.balance) - cents(input.stake) + (enabled ? 0 : cents(input.claim));
  if (!Number.isSafeInteger(balanceCents)) throw new Error("Wallet limit exceeded.");
  user.balance = balanceCents / 100;
  user.updatedAt = now;
  await tx.put("users", userId, user);
  await tx.insert("gameresults", id, result);
  return { ok: true, balance: user.balance, wagerId: input.wagerId, poolPending: enabled,
    poolVersion: result.poolVersion, claim: input.claim, replay: false };
}
