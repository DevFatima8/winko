import { randomInt } from "node:crypto";
import type { MultiplayerGame } from "./multiplayer-types";

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Card = { rank: string; value: number; suit: Suit };
export type BaccaratOutcome = { playerCards: Card[]; bankerCards: Card[]; playerTotal: number; bankerTotal: number; winner: "player" | "banker" | "tie" };
export type SpeedCard = { rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"; value: number; suit: "spades" | "hearts" | "diamonds" | "clubs"; key: string };
export type SpeedBaccaratOutcome = { player: SpeedCard[]; banker: SpeedCard[]; pTotal: number; bTotal: number; winner: BaccaratOutcome["winner"]; playerPair: boolean; bankerPair: boolean };
export type FootballOutcome = { home: { rank: number; suit: Suit }; away: { rank: number; suit: Suit }; outcome: "HOME" | "DRAW" | "AWAY" };
export type Cards32Outcome = { draws: Card[][]; totals: number[]; winner: number };
export type RouletteOutcome = { number: number; lightning: Record<number, number> };
export type DreamSpot = "1" | "2" | "5" | "10" | "20" | "40" | "2x" | "7x";
export type DreamOutcome = { steps: { index: number; spot: DreamSpot; multiplier: number }[]; finalSpot: DreamSpot; totalMultiplier: number };
export type DiceOutcome = { dice: [number, number, number]; total: number; side: "tai" | "xiu" };
export type SevenOutcome = { dice: [number, number]; total: number };
export type CricketMatch = { innings: 1 | 2; batting: 0 | 1; runs: number; wickets: number; balls: number; target: number | null; thisOver: CricketOutcome["outcome"][] };
export type CricketOutcome = { outcome: "dot" | "single" | "two" | "four" | "six" | "wicket"; match?: CricketMatch };
export type BlastOutcome = { crashPoint: number };
export type MultiplayerOutcome = BaccaratOutcome | SpeedBaccaratOutcome | FootballOutcome | Cards32Outcome | RouletteOutcome | DreamOutcome | DiceOutcome | SevenOutcome | CricketOutcome | BlastOutcome;

const suits: Suit[] = ["♠", "♥", "♦", "♣"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const pick = <T,>(values: readonly T[]): T => values[randomInt(values.length)];
const cents = (n: number) => Math.round(n * 100) / 100;
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function baccarat(): BaccaratOutcome {
  const deck: Card[] = [];
  for (let d = 0; d < 8; d++) for (const suit of suits) for (const rank of ranks) {
    deck.push({ rank, suit, value: rank === "A" ? 1 : Number(rank) < 10 ? Number(rank) : 0 });
  }
  shuffle(deck);
  const draw = () => deck.pop()!;
  const playerCards = [draw(), draw()], bankerCards = [draw(), draw()];
  const total = (cards: Card[]) => cards.reduce((n, c) => n + c.value, 0) % 10;
  const p = total(playerCards), b = total(bankerCards);
  if (p < 8 && b < 8) {
    const third = p <= 5 ? draw() : null;
    if (third) playerCards.push(third);
    if (third === null ? b <= 5 : b <= 2 || (b === 3 && third.value !== 8) || (b === 4 && third.value >= 2 && third.value <= 7) || (b === 5 && third.value >= 4 && third.value <= 7) || (b === 6 && (third.value === 6 || third.value === 7))) bankerCards.push(draw());
  }
  const playerTotal = total(playerCards), bankerTotal = total(bankerCards);
  return { playerCards, bankerCards, playerTotal, bankerTotal, winner: playerTotal > bankerTotal ? "player" : bankerTotal > playerTotal ? "banker" : "tie" };
}

const wheel: DreamSpot[] = [
  "40", "10", "1", "5", "1", "2", "1", "2x", "2", "1", "1", "5", "2", "1",
  "2", "10", "20", "1", "1", "5", "2", "1", "2", "1", "1", "2", "1", "5",
  "10", "7x", "2", "1", "1", "2", "5", "2x", "1", "2", "1", "1", "2", "1",
  "5", "10", "20", "2", "1", "1", "2", "1", "5", "2", "1", "2",
];
const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
type RouletteMarket = { numbers: number[]; multiplier: number; straight?: boolean };
const autoMarkets = new Map<string, RouletteMarket>();
const lightningMarkets = new Map<string, RouletteMarket>();
function addAuto(type: string, numbers: number[], multiplier: number) {
  autoMarkets.set(`${type}:${numbers.join("-")}`, { numbers, multiplier, straight: type === "n" });
}
for (let n = 0; n <= 36; n++) {
  addAuto("n", [n], 36);
  lightningMarkets.set(`n-${n}`, { numbers: [n], multiplier: 36, straight: true });
}
for (let n = 1; n <= 36; n++) {
  if (n <= 33) {
    addAuto("sp", [n, n + 3], 18);
    lightningMarkets.set(`sp-${n}-${n + 3}`, { numbers: [n, n + 3], multiplier: 18 });
  }
  if (n % 3 !== 0 && n <= 35) {
    addAuto("sp", [n, n + 1], 18);
    lightningMarkets.set(`sp-${n}-${n + 1}`, { numbers: [n, n + 1], multiplier: 18 });
  }
  if (n % 3 !== 0 && n <= 32) {
    const numbers = [n, n + 1, n + 3, n + 4];
    addAuto("co", numbers, 9);
    lightningMarkets.set(`co-${n}`, { numbers, multiplier: 9 });
  }
  if (n % 3 === 1) {
    addAuto("st", range(n, n + 2), 12);
    lightningMarkets.set(`st-${n}`, { numbers: range(n, n + 2), multiplier: 12 });
    if (n <= 31) {
      addAuto("sl", range(n, n + 5), 6);
      lightningMarkets.set(`li-${n}`, { numbers: range(n, n + 5), multiplier: 6 });
    }
  }
}
for (let n = 1; n <= 3; n++) {
  addAuto("sp", [0, n], 18);
  lightningMarkets.set(`sp-0-${n}`, { numbers: [0, n], multiplier: 18 });
  const col = range(1, 36).filter(v => v % 3 === n % 3);
  autoMarkets.set(`col:${n}`, { numbers: col, multiplier: 3 });
  lightningMarkets.set(`col-${3 - n}`, { numbers: col, multiplier: 3 });
  const dozen = range((n - 1) * 12 + 1, n * 12);
  autoMarkets.set(`dz:${n}`, { numbers: dozen, multiplier: 3 });
  lightningMarkets.set(`doz-${n - 1}`, { numbers: dozen, multiplier: 3 });
}
for (const numbers of [[0, 1, 2], [0, 2, 3]]) {
  addAuto("tr", numbers, 12);
  lightningMarkets.set(`tr-${numbers.join("-")}`, { numbers, multiplier: 12 });
}
addAuto("fo", [0, 1, 2, 3], 9);
for (const [name, numbers] of Object.entries({
  low: range(1, 18), high: range(19, 36),
  even: range(1, 36).filter(n => n % 2 === 0), odd: range(1, 36).filter(n => n % 2 === 1),
  red: range(1, 36).filter(n => red.has(n)), black: range(1, 36).filter(n => !red.has(n)),
})) {
  autoMarkets.set(`${name}:`, { numbers, multiplier: 2 });
  autoMarkets.set(name, { numbers, multiplier: 2 });
  lightningMarkets.set(`out-${name}`, { numbers, multiplier: 2 });
}
const totalOdds: Record<number, number> = { 4: 51, 5: 19, 6: 15, 7: 13, 8: 9, 9: 7, 10: 7, 11: 7, 12: 7, 13: 9, 14: 13, 15: 15, 16: 19, 17: 51 };
const cricketMarkets: Record<string, { covers: string[]; odds: number }> = {
  dot: { covers: ["dot"], odds: 2.8 }, single: { covers: ["single"], odds: 2.6 },
  two: { covers: ["two"], odds: 6 }, four: { covers: ["four"], odds: 5 }, six: { covers: ["six"], odds: 9 },
  wicket: { covers: ["wicket"], odds: 7 }, boundary: { covers: ["four", "six"], odds: 3.2 }, runs: { covers: ["single", "two"], odds: 2.2 },
};

/** Validates exact table-generated keys, never client-provided coverage or odds. */
export function validateOption(game: MultiplayerGame, option: string): boolean {
  switch (game) {
    case "baccarat": return ["player", "banker", "tie"].includes(option);
    case "speed-baccarat": return ["player", "banker", "tie", "playerPair", "bankerPair"].includes(option);
    case "football-studio": return ["HOME", "DRAW", "AWAY"].includes(option);
    case "32-cards": return ["A", "B", "C", "D", "ODD", "EVEN"].includes(option);
    case "auto-roulette": return autoMarkets.has(option);
    case "lightning-roulette": return lightningMarkets.has(option);
    case "dream-catcher": return wheel.includes(option as DreamSpot);
    case "sic-bo": return ["small", "big", "triple"].includes(option) || /^total-(?:[4-9]|1[0-7])$/.test(option);
    case "tai-xiu": return ["tai", "xiu"].includes(option);
    case "7-up-down": return ["up", "down", "lucky"].includes(option);
    case "nine-wickets": return Object.hasOwn(cricketMarkets, option);
    case "blast-off": return option === "main";
  }
}

/** Cryptographic randomness; no bets, player identity, or stake enter outcome generation. */
export function createOutcome(game: MultiplayerGame): MultiplayerOutcome {
  switch (game) {
    case "baccarat": return baccarat();
    case "speed-baccarat": {
      const hand = baccarat();
      const names = ["spades", "hearts", "diamonds", "clubs"] as const;
      const convert = (cards: Card[], side: string): SpeedCard[] => cards.map((c, i) => ({ ...c, rank: c.rank as SpeedCard["rank"], suit: names[suits.indexOf(c.suit)], key: `${side}-${i}` }));
      return { player: convert(hand.playerCards, "p"), banker: convert(hand.bankerCards, "b"), pTotal: hand.playerTotal, bTotal: hand.bankerTotal, winner: hand.winner, playerPair: hand.playerCards[0].rank === hand.playerCards[1].rank, bankerPair: hand.bankerCards[0].rank === hand.bankerCards[1].rank };
    }
    case "football-studio": {
      const cards = shuffle(suits.flatMap(suit => range(2, 14).map(rank => ({ rank, suit }))));
      const [home, away] = cards;
      return { home, away, outcome: home.rank > away.rank ? "HOME" : home.rank < away.rank ? "AWAY" : "DRAW" };
    }
    case "32-cards": {
      // Exhausted tie shoes are redealt, as in the original 32-card engine.
      for (let attempt = 0; attempt < 64; attempt++) {
        const deck = shuffle(suits.flatMap(suit => range(6, 13).map(value => ({ suit, value, rank: value <= 10 ? String(value) : ["J", "Q", "K"][value - 11] }))));
        const draws: Card[][] = [[], [], [], []], totals = [8, 9, 10, 11];
        let active = [0, 1, 2, 3];
        for (let pass = 0; pass < 16 && deck.length >= active.length; pass++) {
          for (const i of active) { const card = deck.pop()!; draws[i].push(card); totals[i] += card.value; }
          const maximum = Math.max(...active.map(i => totals[i]));
          active = active.filter(i => totals[i] === maximum);
          if (active.length === 1) return { draws, totals, winner: active[0] };
        }
      }
      throw new Error("Unable to deal an untied 32-card shoe.");
    }
    case "auto-roulette": return { number: randomInt(37), lightning: {} };
    case "lightning-roulette": {
      const numbers = shuffle(range(0, 36)), lightning: Record<number, number> = {};
      const choices = [...Array(30).fill(50), ...Array(25).fill(100), ...Array(20).fill(200), ...Array(13).fill(300), ...Array(8).fill(400), ...Array(4).fill(500)] as number[];
      for (let i = 0, count = randomInt(1, 6); i < count; i++) lightning[numbers[i]] = pick(choices);
      return { number: randomInt(37), lightning };
    }
    case "dream-catcher": {
      const steps: DreamOutcome["steps"] = [];
      let totalMultiplier = 1;
      for (let i = 0; i < 3; i++) {
        const index = i === 2 ? pick(range(0, wheel.length - 1).filter(n => !wheel[n].endsWith("x"))) : randomInt(wheel.length);
        const spot = wheel[index], multiplier = spot === "2x" ? 2 : spot === "7x" ? 7 : 1;
        steps.push({ index, spot, multiplier });
        totalMultiplier *= multiplier;
        if (multiplier === 1) return { steps, finalSpot: spot, totalMultiplier };
      }
      throw new Error("Invalid dream wheel chain.");
    }
    case "sic-bo":
    case "tai-xiu": {
      const dice: DiceOutcome["dice"] = game === "tai-xiu"
        ? pick(range(0, 215).map(i => [Math.floor(i / 36) + 1, Math.floor(i / 6) % 6 + 1, i % 6 + 1] as DiceOutcome["dice"]).filter(d => !d.every(v => v === d[0])))
        : [randomInt(1, 7), randomInt(1, 7), randomInt(1, 7)];
      const total = dice.reduce((n, d) => n + d, 0);
      return { dice, total, side: total >= 11 ? "tai" : "xiu" };
    }
    case "7-up-down": {
      const dice: SevenOutcome["dice"] = [randomInt(1, 7), randomInt(1, 7)];
      return { dice, total: dice[0] + dice[1] };
    }
    case "nine-wickets": {
      const bag: CricketOutcome["outcome"][] = [];
      for (const [id, weight] of [["dot", 28], ["single", 30], ["two", 10], ["four", 14], ["six", 8], ["wicket", 10]] as const) for (let i = 0; i < weight; i++) bag.push(id);
      return { outcome: pick(bag) };
    }
    case "blast-off":
      // The neutral idle-flight distribution, independent of all cashout targets.
      return { crashPoint: cents(1 + Math.pow(randomInt(0x1000000) / 0x1000000, 2.1) * 14) };
  }
}

export const multiplierAt = (seconds: number) => Math.min(250, Math.exp(0.155 * Math.max(0, seconds)));
export const flightMs = (crashPoint: number) => Math.log(Math.max(1, crashPoint)) / 0.155 * 1000;
export function advanceCricketMatch(outcome: CricketOutcome["outcome"], previous?: CricketMatch): CricketMatch {
  const m: CricketMatch = previous ?? { innings: 1, batting: 0, runs: 86, wickets: 2, balls: 57, target: null, thisOver: ["single", "dot", "four"] };
  const balls = m.balls + 1, wickets = m.wickets + (outcome === "wicket" ? 1 : 0);
  const runs = m.runs + ({ dot: 0, single: 1, two: 2, four: 4, six: 6, wicket: 0 }[outcome]);
  const thisOver = (balls - 1) % 6 === 0 ? [outcome] : [...m.thisOver, outcome];
  if (wickets < 10 && balls < 120 && !(m.innings === 2 && runs >= (m.target ?? 0))) return { ...m, balls, wickets, runs, thisOver };
  if (m.innings === 1) return { innings: 2, batting: m.batting === 0 ? 1 : 0, runs: 0, wickets: 0, balls: 0, target: runs + 1, thisOver: [] };
  return { innings: 1, batting: 0, runs: 0, wickets: 0, balls: 0, target: null, thisOver: [] };
}
export function timings(game: MultiplayerGame) {
  return { bettingMs: game === "blast-off" ? 6000 : game === "speed-baccarat" ? 9000 : game === "7-up-down" ? 13000 : game === "football-studio" || game === "nine-wickets" ? 12000 : game === "auto-roulette" ? 20000 : game === "lightning-roulette" ? 25000 : 15000,
    runningMs: game === "blast-off" ? Math.ceil(flightMs(250)) : game === "dream-catcher" ? 12000 : game.includes("roulette") ? 8000 : 5000,
    resultMs: game === "blast-off" ? 3200 : 5000 };
}

/** Gross return including stake. Source-table payout formulas are preserved. */
export function grossPayout(game: MultiplayerGame, option: string, amount: number, result: MultiplayerOutcome): number {
  let multiple = 0;
  switch (game) {
    case "baccarat": {
      const r = result as BaccaratOutcome;
      return r.winner === option ? Math.round(amount * ({ player: 2, banker: 1.95, tie: 9 }[option] ?? 0)) : 0;
    }
    case "speed-baccarat": {
      const r = result as SpeedBaccaratOutcome;
      if (option === "playerPair" || option === "bankerPair") multiple = r[option] ? 12 : 0;
      else if (r.winner === "tie" && option !== "tie") multiple = 1;
      else if (r.winner === option) multiple = option === "tie" ? 9 : option === "banker" ? 1.95 : 2;
      break;
    }
    case "football-studio": {
      const r = result as FootballOutcome;
      return Math.floor(amount * (r.outcome === option ? option === "DRAW" ? 12 : 2 : r.outcome === "DRAW" && option !== "DRAW" ? 0.5 : 0));
    }
    case "32-cards": {
      const r = result as Cards32Outcome;
      const hit = option === "ODD" ? r.totals[r.winner] % 2 === 1 : option === "EVEN" ? r.totals[r.winner] % 2 === 0 : ["A", "B", "C", "D"][r.winner] === option;
      multiple = hit ? ({ A: 12.2, B: 6.2, C: 3.25, D: 2.05, ODD: 1.95, EVEN: 1.95 }[option] ?? 0) : 0;
      break;
    }
    case "auto-roulette":
    case "lightning-roulette": {
      const r = result as RouletteOutcome, market = (game === "auto-roulette" ? autoMarkets : lightningMarkets).get(option);
      multiple = market?.numbers.includes(r.number) ? market.straight && r.lightning[r.number] ? r.lightning[r.number] + 1 : market.multiplier : 0;
      break;
    }
    case "dream-catcher": {
      const r = result as DreamOutcome;
      multiple = option === r.finalSpot && !option.endsWith("x") ? (Number(option) + 1) * r.totalMultiplier : 0;
      break;
    }
    case "sic-bo": {
      const r = result as DiceOutcome, triple = r.dice.every(d => d === r.dice[0]);
      if (option === "small") multiple = !triple && r.total >= 4 && r.total <= 10 ? 2 : 0;
      else if (option === "big") multiple = !triple && r.total >= 11 && r.total <= 17 ? 2 : 0;
      else if (option === "triple") multiple = triple ? 31 : 0;
      else multiple = option === `total-${r.total}` ? totalOdds[r.total] ?? 0 : 0;
      break;
    }
    case "tai-xiu": multiple = (result as DiceOutcome).side === option ? 2 : 0; break;
    case "7-up-down": {
      const t = (result as SevenOutcome).total;
      multiple = option === "lucky" && t === 7 ? 5 : option === "down" && t < 7 || option === "up" && t > 7 ? 2 : 0;
      break;
    }
    case "nine-wickets": {
      const market = cricketMarkets[option];
      multiple = market?.covers.includes((result as CricketOutcome).outcome) ? market.odds : 0;
      break;
    }
    case "blast-off": return 0; // Cashouts are timestamped and settled by the room.
  }
  return cents(amount * multiple);
}
