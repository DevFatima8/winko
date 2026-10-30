function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export type Suit = "S" | "H" | "D" | "C";
export type Card = { rank: number; suit: Suit };
export type Outcome = "win" | "lose" | "tie";

const SUITS: Suit[] = ["S", "H", "D", "C"];

// Overall player win chance = 35%, loss chance = 65%
export const WIN_RATE = 0.35;
// Chance that the first two cards are a tie (leads to War / Surrender choice)
const TIE_RATE = 0.08;

function chance(p: number) {
  return randomInt(1_000_000) < p * 1_000_000;
}

function randomSuit(): Suit {
  return SUITS[randomInt(SUITS.length)];
}

// ranks 2..14 (14 = Ace, Ace is high)
function pair(outcome: Outcome): { player: Card; dealer: Card } {
  if (outcome === "tie") {
    const rank = 2 + randomInt(13);
    const s1 = randomSuit();
    let s2 = randomSuit();
    while (s2 === s1) s2 = randomSuit();
    return { player: { rank, suit: s1 }, dealer: { rank, suit: s2 } };
  }
  const a = 2 + randomInt(13);
  let b = 2 + randomInt(13);
  while (b === a) b = 2 + randomInt(13);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return outcome === "win"
    ? { player: { rank: hi, suit: randomSuit() }, dealer: { rank: lo, suit: randomSuit() } }
    : { player: { rank: lo, suit: randomSuit() }, dealer: { rank: hi, suit: randomSuit() } };
}

export function dealRound() {
  if (chance(TIE_RATE)) {
    return { result: "tie" as Outcome, ...pair("tie") };
  }
  const result: Outcome = chance(WIN_RATE) ? "win" : "lose";
  return { result, ...pair(result) };
}

export function warRound() {
  const result: Outcome = chance(WIN_RATE) ? "win" : "lose";
  return { result, ...pair(result) };
}
