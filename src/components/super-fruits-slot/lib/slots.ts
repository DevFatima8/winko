
export type FruitId = "cherry" | "lemon" | "orange" | "grape" | "melon" | "star";

export interface Fruit {
  id: FruitId;
  name: string;
  emoji: string;
  pay: number; // multiplier paid on a 3-of-a-kind line
  weight: number; // relative weight when choosing the winning fruit
}

export const FRUITS: Fruit[] = [
  { id: "cherry", name: "Cherry", emoji: "🍒", pay: 1.5, weight: 34 },
  { id: "lemon", name: "Lemon", emoji: "🍋", pay: 1.8, weight: 26 },
  { id: "orange", name: "Orange", emoji: "🍊", pay: 2.2, weight: 18 },
  { id: "grape", name: "Grapes", emoji: "🍇", pay: 3, weight: 12 },
  { id: "melon", name: "Watermelon", emoji: "🍉", pay: 4, weight: 7 },
  { id: "star", name: "Star", emoji: "⭐", pay: 7, weight: 3 },
];

export const fruitOf = (id: FruitId): Fruit => FRUITS.find((f) => f.id === id)!;

/** 3 rows + 2 diagonals. Cell index = row * 3 + col (0..8). */
export const LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const WIN_RATE = 0.35;

export interface SpinResult {
  grid: FruitId[]; // 9 cells, row-major
  winLine: number | null; // index into LINES
  winFruit: FruitId | null;
}

const randInt = (n: number) => Math.floor(Math.random() * n);

const randFruitId = (): FruitId => FRUITS[randInt(FRUITS.length)].id;

function pickWinFruit(): FruitId {
  const total = FRUITS.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FRUITS) {
    r -= f.weight;
    if (r <= 0) return f.id;
  }
  return FRUITS[0].id;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Returns a random fruit that does NOT complete any line (except `exceptLine`),
 * given the partially filled grid.
 */
function safeFruitFor(cells: (FruitId | null)[], i: number, exceptLine: number): FruitId {
  const candidates = shuffle(FRUITS.map((f) => f.id));
  for (const f of candidates) {
    let ok = true;
    for (let li = 0; li < LINES.length; li++) {
      if (li === exceptLine) continue;
      const l = LINES[li];
      if (!l.includes(i)) continue;
      const others = l.filter((c) => c !== i);
      if (others.every((c) => cells[c] === f)) {
        ok = false;
        break;
      }
    }
    if (ok) return f;
  }
  // Practically unreachable (>= 2 lines always leave >= 4 safe fruits), but stay deterministic.
  return "cherry";
}

export function findWins(cells: (FruitId | null)[]): { line: number; fruit: FruitId }[] {
  const out: { line: number; fruit: FruitId }[] = [];
  LINES.forEach((l, li) => {
    const [a, b, c] = l;
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
      out.push({ line: li, fruit: cells[a] as FruitId });
    }
  });
  return out;
}

/**
 * Generates a full 3×3 grid for one spin.
 * - willWin=true  → exactly one line is a triple (weighted toward low-payout fruits).
 * - willWin=false → zero triples on any of the 5 lines.
 */
export function generateSpin(willWin: boolean, winningFruit?: FruitId): SpinResult {
  for (let attempt = 0; attempt < 100; attempt++) {
    const cells: (FruitId | null)[] = Array(9).fill(null);

    if (willWin) {
      const line = randInt(LINES.length);
      const fruit = winningFruit ?? pickWinFruit();
      LINES[line].forEach((c) => (cells[c] = fruit));
      const rest = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => !LINES[line].includes(c)));
      for (const c of rest) cells[c] = safeFruitFor(cells, c, line);
    } else {
      const order = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      for (const c of order) cells[c] = safeFruitFor(cells, c, -1);
    }

    const wins = findWins(cells);
    if (willWin && wins.length === 1) {
      return { grid: cells as FruitId[], winLine: wins[0].line, winFruit: wins[0].fruit };
    }
    if (!willWin && wins.length === 0) {
      return { grid: cells as FruitId[], winLine: null, winFruit: null };
    }
  }

  if (willWin) throw new Error("Unable to generate the selected winning fruit.");

  // Fallback (effectively unreachable): a guaranteed non-winning grid.
  const fallback: FruitId[] = ["cherry", "lemon", "grape", "orange", "star", "melon", "lemon", "orange", "cherry"];
  return { grid: fallback, winLine: null, winFruit: null };
}

export function payoutFor(fruitId: FruitId, bet: number): number {
  return Math.round(bet * fruitOf(fruitId).pay);
}
