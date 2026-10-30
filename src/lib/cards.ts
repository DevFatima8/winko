import { checkGameAccess } from "./gameAccess";
import { payoutAfterHouseShare, MAX_MULTIPLIER } from "./outcomes";
import { randomInt } from "node:crypto";


export const MIN_BET = 10;
export const MAX_BET = Number.MAX_SAFE_INTEGER;

export const TABLES = {
  "dragon-tiger": {
    name: "Dragon Tiger",
    icon: "🐉",
    betMs: 20000,
    options: {
      dragon: { label: "Dragon", pays: "1:1", mult: 2 },
      tie: { label: "Tie", pays: "1:1", mult: 2 },
      tiger: { label: "Tiger", pays: "1:1", mult: 2 },
    },
  },
  "andar-bahar": {
    name: "Andar Bahar",
    icon: "🃏",
    betMs: 20000,
    options: {
      andar: { label: "Andar", pays: "0.9:1", mult: 1.9 },
      bahar: { label: "Bahar", pays: "1:1", mult: 2 },
    },
  },
} as const;
export type Table = keyof typeof TABLES;
export const isTable = (t: string): t is Table => t in TABLES;

export type Card = { r: number; s: number }; // r: 1..13 (A..K), s: 0♠ 1♥ 2♦ 3♣
export type DTResult = { kind: "dragon-tiger"; dragon: Card; tiger: Card; winner: "dragon" | "tiger" | "tie" };
export type ABResult = { kind: "andar-bahar"; joker: Card; andar: Card[]; bahar: Card[]; winner: "andar" | "bahar"; dealMs: number };
export type Result = DTResult | ABResult;

function shoe(decks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) cards.push({ r, s });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function generate(table: Table): { result: Result; revealMs: number } {
  if (table === "dragon-tiger") {
    const s = shoe(8); // 8-deck shoe like a real casino
    const dragon = s[0], tiger = s[1];
    const winner = dragon.r > tiger.r ? "dragon" : tiger.r > dragon.r ? "tiger" : "tie";
    return { result: { kind: table, dragon, tiger, winner }, revealMs: 7000 };
  }
  const s = shoe(1);
  const joker = s[0];
  const andar: Card[] = [], bahar: Card[] = [];
  let winner: "andar" | "bahar" = "andar";
  for (let i = 1; i < s.length; i++) {
    const toAndar = i % 2 === 1; // dealing always starts on Andar
    (toAndar ? andar : bahar).push(s[i]);
    if (s[i].r === joker.r) { winner = toAndar ? "andar" : "bahar"; break; }
  }
  const dealt = andar.length + bahar.length;
  const dealMs = 900;
  return { result: { kind: table, joker, andar, bahar, winner, dealMs }, revealMs: 1400 + dealt * dealMs + 3200 };
}

export type BetTarget = { roundNo: number; queued: boolean };

/** Round that an explicit bet submitted at `now` belongs to: the open round, otherwise the next round (N+1). */
export function betTargetFor(r: { roundNo: number; status: string; bettingEndsAt: Date | string | number }, now = Date.now()): BetTarget {
  const open = r.status === "betting" && now < new Date(r.bettingEndsAt).getTime();
  return open ? { roundNo: r.roundNo, queued: false } : { roundNo: r.roundNo + 1, queued: true };
}

export function payoutFor(result: Result, option: string, amount: number) {
  return payoutAfterHouseShare(Math.min(MAX_MULTIPLIER * amount, rawPayoutFor(result, option, amount)));
}

/** Gross payout before the house share (used both for the net payout and the withheld 2%). */
export function rawPayoutFor(result: Result, option: string, amount: number) {
  let raw = 0;
  if (result.kind === "dragon-tiger") {
    if (option === "tie") raw = result.winner === "tie" ? amount * 9 : 0;
    else if (result.winner === "tie") raw = amount * 0.5; // Dragon/Tiger bets: half refund on tie
    else raw = option === result.winner ? amount * 2 : 0;
  } else if (option === result.winner) {
    raw = option === "andar" ? amount * 1.9 : amount * 2;
  }
  return raw;
}

/** New personal rounds only; the helpers above retain accepted shared-round contracts. */
export function personalGross(winner: string, option: string, amount: number) {
  return winner === option ? amount * (winner === "andar" ? 1.9 : 2) : 0;
}

export function personalPayout(winner: string, option: string, amount: number) {
  return payoutAfterHouseShare(personalGross(winner, option, amount));
}

export function personalOutcomes(table: Table, bets: { option: string; amount: number }[]) {
  const stake = bets.reduce((sum, bet) => sum + bet.amount, 0);
  const outcomes = Object.keys(TABLES[table].options).map(winner => ({
    winner,
    payout: bets.reduce((sum, bet) => sum + personalPayout(winner, bet.option, bet.amount), 0),
  }));
  return {
    wins: outcomes.filter(outcome => Math.round(outcome.payout * 100) > Math.round(stake * 100)),
    losses: outcomes.filter(outcome => outcome.payout === 0),
  };
}

/** Construct a physical deal for an already allocated, feasible outcome; never alter a shown card. */
export function generateForWinner(table: Table, winner: string): { result: Result; revealMs: number } {
  if (!Object.hasOwn(TABLES[table].options, winner)) throw new Error("Invalid personal card outcome.");
  if (table === "dragon-tiger") {
    const pairs: [number, number][] = [];
    for (let d = 1; d <= 13; d++) for (let t = 1; t <= 13; t++) {
      if ((d > t ? "dragon" : d < t ? "tiger" : "tie") === winner) pairs.push([d, t]);
    }
    const [d, t] = pairs[randomInt(pairs.length)];
    return {
      result: { kind: table, dragon: { r: d, s: randomInt(4) }, tiger: { r: t, s: randomInt(4) }, winner: winner as DTResult["winner"] },
      revealMs: 7000,
    };
  }
  const deck = shoe(1), joker = deck.shift()!;
  const matching = deck.find(card => card.r === joker.r)!;
  const others = deck.filter(card => card.r !== joker.r);
  const count = randomInt(10) * 2 + (winner === "andar" ? 1 : 2);
  const dealt = [...others.slice(0, count - 1), matching];
  const andar = dealt.filter((_, index) => index % 2 === 0);
  const bahar = dealt.filter((_, index) => index % 2 === 1);
  const dealMs = 900;
  return {
    result: { kind: table, joker, andar, bahar, winner: winner as ABResult["winner"], dealMs },
    revealMs: 1400 + count * dealMs + 3200,
  };
}

const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];
const cardStr = (c: Card) => `${RANKS[c.r]}${SUITS[c.s]}`;
export function describe(result: Result) {
  if (result.kind === "dragon-tiger") return `Dragon ${cardStr(result.dragon)} vs Tiger ${cardStr(result.tiger)} → ${result.winner === "tie" ? "TIE" : result.winner.toUpperCase()}`;
  return `Joker ${cardStr(result.joker)} → ${result.winner.toUpperCase()} (${result.andar.length + result.bahar.length} cards)`;
}

export async function getState(userId: string | null, table: Table) {
  return (await import("./sharedLegacyTables")).sharedCardState(userId, table);
}

/**
 * Places an explicit bet only while the current round is open. Once betting closes,
 * the caller must wait for the following round; new next-round reservations are rejected.
 * `targetRound` is the round the client intended; a mismatch is rejected without touching the balance.
 */
export async function placeBet(userId: string, table: Table, option: string, amount: number, targetRound?: number, requestId?: string) {
  const opts = TABLES[table].options as Record<string, unknown>;
  if (!(option in opts)) return { error: "Invalid bet option." };
  if (!Number.isFinite(amount) || amount < MIN_BET) return { error: `Minimum bet Rs. ${MIN_BET} hai.` };
  amount = Math.floor(amount);
  const denied = await checkGameAccess(userId, table);
  if (denied) return { error: denied };
  return (await import("./sharedLegacyTables")).sharedCardBet(userId, table, option, amount, targetRound, requestId);
}

/** Cancels the caller's pending bets for the open round ("current") or the reserved next round ("queued"). */
export async function cancelBets(userId: string, table: Table, scope: "current" | "queued" = "current", expectedRound?: number) {
  return (await import("./sharedLegacyTables")).sharedCardCancel(userId, table, scope, expectedRound);
}
