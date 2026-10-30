export type Card = { r: number; s: number };
export type Side = "A" | "B";
export type Round = { a: Card[]; b: Card[]; hukam: Card; winner: Side; sa: number[]; sb: number[] };

function deck(): Card[] {
  const cards: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) cards.push({ r, s });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function scoreFixed(hand: Card[]): number[] {
  const ranks = hand.map(card => card.r).sort((a, b) => b - a);
  const flush = hand.every(card => card.s === hand[0].s);
  let sequence = 0;
  if (ranks[0] - 1 === ranks[1] && ranks[1] - 1 === ranks[2]) sequence = ranks[0] === 14 ? 15 : ranks[0];
  if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) sequence = 14;
  if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return [6, ranks[0]];
  if (sequence && flush) return [5, sequence];
  if (sequence) return [4, sequence];
  if (flush) return [3, ...ranks];
  if (ranks[0] === ranks[1]) return [2, ranks[0], ranks[2]];
  if (ranks[1] === ranks[2]) return [2, ranks[1], ranks[0]];
  return [1, ...ranks];
}

export function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export function score(hand: Card[], hukam: number): number[] {
  const fixed = hand.filter(card => card.r !== hukam);
  if (fixed.length === 3) return scoreFixed(hand);
  if (fixed.length === 0) return [6, 14];
  let best = [0];
  const visit = (cards: Card[]) => {
    if (cards.length === 3) {
      const evaluated = scoreFixed(cards);
      if (compareScores(evaluated, best) > 0) best = evaluated;
      return;
    }
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) visit([...cards, { r, s }]);
  };
  visit(fixed);
  return best;
}

export function makeRound(winner?: Side): Round {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const cards = deck();
    const hukam = cards[0];
    let a = cards.slice(1, 4), b = cards.slice(4, 7);
    let sa = score(a, hukam.r), sb = score(b, hukam.r);
    const comparison = compareScores(sa, sb);
    if (!comparison) continue;
    if (winner && (comparison > 0 ? "A" : "B") !== winner) {
      [a, b] = [b, a];
      [sa, sb] = [sb, sa];
    }
    return { a, b, hukam, sa, sb, winner: winner ?? (comparison > 0 ? "A" : "B") };
  }
  throw new Error("Unable to deal Hukam cards. Retry the same wager.");
}
