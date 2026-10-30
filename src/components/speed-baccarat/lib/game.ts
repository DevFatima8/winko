import { BET_PRESETS } from "@/lib/betPresets";
import {
  dealConstrained,
  dealRandom,
  handTotal,
  isPair,
  type Card,
  type Side,
} from "./baccarat";

/** ---------------------------------------------------------------- odds **/

/** Configured hit-rate of the player: 35 % winning rounds, 65 % losing rounds. */
export const WIN_CHANCE = 0.35;
export const LOSS_CHANCE = 0.65;

export type BetKey = "player" | "banker" | "tie" | "playerPair" | "bankerPair";

export type Bets = Record<BetKey, number>;

export const EMPTY_BETS: Bets = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 };

export type BetMeta = {
  key: BetKey;
  label: string;
  short: string;
  payout: number; // multiple of stake returned as profit
  tone: "blue" | "red" | "green" | "gold";
  note: string;
};

export const BET_META: Record<BetKey, BetMeta> = {
  player: { key: "player", label: "PLAYER", short: "PL", payout: 1, tone: "blue", note: "Pays 1 : 1 · pushes on tie" },
  banker: { key: "banker", label: "BANKER", short: "BK", payout: 0.95, tone: "red", note: "Pays 1.95 : 1 · 5 % commission" },
  tie: { key: "tie", label: "TIE", short: "TIE", payout: 8, tone: "green", note: "Pays 8 : 1" },
  playerPair: { key: "playerPair", label: "PLAYER PAIR", short: "P PR", payout: 11, tone: "blue", note: "Pays 11 : 1 · first two player cards" },
  bankerPair: { key: "bankerPair", label: "BANKER PAIR", short: "B PR", payout: 11, tone: "red", note: "Pays 11 : 1 · first two banker cards" },
};

export const CHIP_VALUES = BET_PRESETS;
export const MIN_BET = 10;

export function totalStake(bets: Bets): number {
  return bets.player + bets.banker + bets.tie + bets.playerPair + bets.bankerPair;
}

/** ---------------------------------------------------------------- types **/

export type Stake = { key: BetKey; amount: number; won: boolean; profit: number };

export type RoundResult = {
  id: number;
  player: Card[];
  banker: Card[];
  winner: Side;
  pTotal: number;
  bTotal: number;
  playerPair: boolean;
  bankerPair: boolean;
  stakes: Stake[];
  bet: number;
  net: number;
  graded: "win" | "loss" | "push" | "watched";
  forced: "random" | "win" | "loss";
};

/** ------------------------------------------------------------ settlement */

function mainNet(bets: Bets, outcome: Side): number {
  let net = 0;
  if (outcome === "tie") {
    // Player / Banker stakes push on a tie, the tie bet pays 8 : 1.
    net += bets.tie * BET_META.tie.payout;
  } else {
    net += outcome === "player" ? bets.player * BET_META.player.payout : -bets.player;
    net += outcome === "banker" ? bets.banker * BET_META.banker.payout : -bets.banker;
    net -= bets.tie;
  }
  return net;
}

function pairNet(amount: number, hit: boolean): number {
  if (!amount) return 0;
  return hit ? amount * BET_META.playerPair.payout : -amount;
}

/**
 * Build the round. The engine first decides WIN / LOSS for the player
 * (35 % / 65 %), then reverse-engineers a tableau-legal deal that matches it —
 * including the side bets, so the sign of the payout always agrees with the decision.
 */
export function buildRound(
  bets: Bets,
  id: number,
  force: "random" | "win" | "loss" = "random",
): RoundResult {
  const bet = totalStake(bets);
  const wantsWin = bet <= 0 ? null : force === "win" ? true : force === "loss" ? false : Math.random() < WIN_CHANCE;

  let playerPairFlag: boolean | null = null;
  let bankerPairFlag: boolean | null = null;

  if (wantsWin === null) {
    // Nobody's money on the table — deal an honest, neutral hand and grade nothing.
    const hand = dealRandom();
    return { ...finalise(hand.player, hand.banker, bets, id, "random"), graded: "watched" as const };
  }

  const outcomes: Side[] = ["banker", "player", "tie"];
  const scored = outcomes.map((o) => ({ o, net: mainNet(bets, o) }));
  let candidates = scored.filter((s) => (wantsWin ? s.net > 0 : s.net < 0));

  if (candidates.length === 0) {
    // Degenerate layout (equal stakes both sides): take the closest achievable result.
    const best = wantsWin
      ? scored.reduce((a, b) => (b.net > a.net ? b : a))
      : scored.reduce((a, b) => (b.net < a.net ? b : a));
    candidates = [best];
  }

  // The most believable hand: the side you backed wins on a win, the opposite side on a loss.
  const backedSide: Side | null = bets.player === bets.banker ? null : bets.player > bets.banker ? "player" : "banker";
  const preferred: Side = backedSide
    ? wantsWin
      ? backedSide
      : backedSide === "player"
        ? "banker"
        : "player"
    : wantsWin
      ? "tie"
      : "banker";

  const likesPreferred = candidates.some((c) => c.o === preferred);
  const winner: Side =
    likesPreferred && (candidates.length === 1 || Math.random() < 0.72)
      ? preferred
      : candidates[Math.floor(Math.random() * candidates.length)].o;
  const main = mainNet(bets, winner);

  const pairStake = bets.playerPair + bets.bankerPair;

  if (wantsWin) {
    // Guarantee a positive round even if the side bets miss.
    if (main - pairStake <= 0 && pairStake > 0) {
      if (bets.playerPair > 0) playerPairFlag = true;
      if (bets.bankerPair > 0) bankerPairFlag = true;
    }
  } else if (pairStake > 0) {
    // Guarantee a negative round: side bets must miss too.
    if (bets.playerPair > 0) playerPairFlag = false;
    if (bets.bankerPair > 0) bankerPairFlag = false;
  }

  const hand = dealConstrained({
    winner,
    playerPair: playerPairFlag,
    bankerPair: bankerPairFlag,
  });

  return finalise(hand.player, hand.banker, bets, id, force, main);
}

function finalise(
  player: Card[],
  banker: Card[],
  bets: Bets,
  id: number,
  forced: RoundResult["forced"],
  _mainNetHint?: number,
): RoundResult {
  const pTotal = handTotal(player);
  const bTotal = handTotal(banker);
  const winner = pTotal > bTotal ? "player" : bTotal > pTotal ? "banker" : "tie";
  const playerPair = isPair(player);
  const bankerPair = isPair(banker);

  const stakes: Stake[] = [];
  let net = 0;

  const push = winner === "tie";
  (["player", "banker"] as BetKey[]).forEach((key) => {
    const amount = bets[key];
    if (!amount) return;
    const won = winner === key;
    const profit = push ? 0 : won ? amount * BET_META[key].payout : -amount;
    stakes.push({ key, amount, won: push ? false : won, profit });
    net += profit;
  });

  if (bets.tie) {
    const won = winner === "tie";
    const profit = won ? bets.tie * BET_META.tie.payout : -bets.tie;
    stakes.push({ key: "tie", amount: bets.tie, won, profit });
    net += profit;
  }

  if (bets.playerPair) {
    const profit = pairNet(bets.playerPair, playerPair);
    stakes.push({ key: "playerPair", amount: bets.playerPair, won: playerPair, profit });
    net += profit;
  }
  if (bets.bankerPair) {
    const profit = pairNet(bets.bankerPair, bankerPair);
    stakes.push({ key: "bankerPair", amount: bets.bankerPair, won: bankerPair, profit });
    net += profit;
  }

  // The engine already decided the sign of this round; here we grade what was actually dealt.
  const gradedFinal: RoundResult["graded"] = net > 0 ? "win" : net < 0 ? "loss" : "push";

  return {
    id,
    player,
    banker,
    winner,
    pTotal,
    bTotal,
    playerPair,
    bankerPair,
    stakes,
    bet: totalStake(bets),
    net,
    graded: gradedFinal,
    forced,
  };
}

/** ---------------------------------------------------------------- stats  */

export type Stats = {
  rounds: number;
  wins: number;
  losses: number;
  pushes: number;
  net: number;
  wagered: number;
  best: number;
  worst: number;
  streak: number; // + = winning streak, - = losing streak
  bestStreak: number;
  players: number;
  bankers: number;
  ties: number;
  pairs: number;
};

export const EMPTY_STATS: Stats = {
  rounds: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  net: 0,
  wagered: 0,
  best: 0,
  worst: 0,
  streak: 0,
  bestStreak: 0,
  players: 0,
  bankers: 0,
  ties: 0,
  pairs: 0,
};

export function applyRound(stats: Stats, round: RoundResult): Stats {
  if (round.graded === "watched") return stats;
  const wins = round.graded === "win" ? 1 : 0;
  const losses = round.graded === "loss" ? 1 : 0;
  const streak = round.net > 0 ? Math.max(1, stats.streak + 1) : round.net < 0 ? Math.min(-1, stats.streak - 1) : stats.streak;
  return {
    rounds: stats.rounds + 1,
    wins: stats.wins + wins,
    losses: stats.losses + losses,
    pushes: stats.pushes + (round.graded === "push" ? 1 : 0),
    net: round.net + stats.net,
    wagered: stats.wagered + round.bet,
    best: Math.max(stats.best, round.net),
    worst: Math.min(stats.worst, round.net),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    players: stats.players + (round.winner === "player" ? 1 : 0),
    bankers: stats.bankers + (round.winner === "banker" ? 1 : 0),
    ties: stats.ties + (round.winner === "tie" ? 1 : 0),
    pairs: stats.pairs + (round.playerPair ? 1 : 0) + (round.bankerPair ? 1 : 0),
  };
}

export function winRate(stats: Stats): number {
  const decided = stats.wins + stats.losses;
  if (!decided) return 0;
  return (stats.wins / decided) * 100;
}

export function money(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: abs % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}Rs. ${s}`;
}

/** ------------------------------------------------------------- roadmap   */

export type HistoryEntry = {
  id: number;
  winner: Side;
  pTotal: number;
  bTotal: number;
  playerPair: boolean;
  bankerPair: boolean;
};

export function toHistory(round: RoundResult): HistoryEntry {
  return {
    id: round.id,
    winner: round.winner,
    pTotal: round.pTotal,
    bTotal: round.bTotal,
    playerPair: round.playerPair,
    bankerPair: round.bankerPair,
  };
}

export type BigCell = { side: "player" | "banker"; ties: number; pair: "none" | "player" | "banker" | "both" };

export function buildBigRoad(history: HistoryEntry[]): { columns: BigCell[][]; orphanTies: number } {
  const columns: BigCell[][] = [];
  let orphanTies = 0;

  for (const entry of history) {
    if (entry.winner === "tie") {
      const lastCol = columns[columns.length - 1];
      const lastCell = lastCol?.[lastCol.length - 1];
      if (lastCell) lastCell.ties += 1;
      else orphanTies += 1;
      continue;
    }
    const side = entry.winner;
    const pair: BigCell["pair"] =
      entry.playerPair && entry.bankerPair ? "both" : entry.playerPair ? "player" : entry.bankerPair ? "banker" : "none";
    const lastCol = columns[columns.length - 1];
    const head = lastCol?.[lastCol.length - 1];
    if (lastCol && head && head.side === side && lastCol.length < 6) {
      lastCol.push({ side, ties: 0, pair });
    } else if (!lastCol || head?.side === side) {
      // streak already maxed vertically -> start a fresh column for readability
      columns.push([{ side, ties: 0, pair }]);
    } else {
      columns.push([{ side, ties: 0, pair }]);
    }
  }

  return { columns, orphanTies };
}

/** Pattern roads (approximated domino "dice"): lag 1 = Big Eye Boy, lag 2 = Small Road. */
export function buildPatternRoad(columns: BigCell[][], lag: number): { red: boolean; row: number; col: number }[] {
  const out: { red: boolean; row: number; col: number }[] = [];
  for (let c = lag; c < columns.length; c++) {
    const prev = columns[c - 1].length;
    const prevPrev = c - 1 - lag >= 0 ? columns[c - 1 - lag].length : 0;
    for (let r = 0; r < columns[c].length; r++) {
      const red = r === 0 ? prev > 1 === prevPrev > 1 : r < prev;
      out.push({ red, row: r, col: c - lag });
    }
  }
  return out;
}
