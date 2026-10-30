export type Suit = 'S' | 'H' | 'D' | 'C';

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export const SUIT_COLOR: Record<Suit, 'red' | 'black'> = {
  S: 'black',
  H: 'red',
  D: 'red',
  C: 'black',
};

export interface Card {
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
  suit: Suit;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Cryptographically secure random number in [0, 1).
 * Uses the Web Crypto API so the shuffle cannot be predicted or rigged.
 */
function secureRandom(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / 2 ** 32;
}

/** Fisher-Yates shuffle driven by the secure RNG above. */
export function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(secureRandom() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function rankLabel(rank: number): string {
  switch (rank) {
    case 14:
      return 'A';
    case 13:
      return 'K';
    case 12:
      return 'Q';
    case 11:
      return 'J';
    default:
      return String(rank);
  }
}

export interface HandScore {
  /** 0 = high card ... 8 = straight flush */
  cat: number;
  /** Tiebreaker ranks, most significant first. */
  ranks: number[];
}

/** Score exactly 5 cards. */
export function score5(cards: Card[]): HandScore {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const firstSuit = cards[0].suit;
  const isFlush = cards.every((c) => c.suit === firstSuit);

  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5; // wheel A-2-3-4-5
  }

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // groups sorted by count desc, then rank desc
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const pattern = groups.map((g) => g[1]).join('');
  const groupRanks = groups.map((g) => g[0]);

  if (isFlush && straightHigh) return { cat: 8, ranks: [straightHigh] };
  if (pattern === '41') return { cat: 7, ranks: groupRanks };
  if (pattern === '32') return { cat: 6, ranks: groupRanks };
  if (isFlush) return { cat: 5, ranks };
  if (straightHigh) return { cat: 4, ranks: [straightHigh] };
  if (pattern === '311') return { cat: 3, ranks: groupRanks };
  if (pattern === '221') return { cat: 2, ranks: groupRanks };
  if (pattern === '2111') return { cat: 1, ranks: groupRanks };
  return { cat: 0, ranks };
}

/** Best 5-card hand out of 5-7 cards (tries every combination). */
export function bestHand(cards: Card[]): HandScore {
  let best: HandScore | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const s = score5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(s, best) > 0) best = s;
          }
  return best!;
}

/** Positive if a beats b, negative if b beats a, 0 for a tie. */
export function compareScores(a: HandScore, b: HandScore): number {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const len = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < len; i++) {
    const d = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const CAT_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

export function describeScore(s: HandScore): string {
  if (s.cat === 8 && s.ranks[0] === 14) return 'Royal Flush';
  return CAT_NAMES[s.cat];
}
