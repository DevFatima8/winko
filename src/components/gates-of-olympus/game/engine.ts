export type SymbolId = "ruby" | "sapphire" | "emerald" | "amethyst" | "crown" | "goblet" | "hourglass" | "bolt";
export type RegularSymbolId = Exclude<SymbolId, "bolt">;
export type Cell = { id: string; symbol: SymbolId; multiplier?: number };
export interface SpinResult {
  grid: Cell[];
  winner: RegularSymbolId | null;
  count: number;
  multiplier: number;
  amount: number;
  bonus: boolean;
}

export const REGULAR_SYMBOLS: RegularSymbolId[] = ["ruby", "sapphire", "emerald", "amethyst", "crown", "goblet", "hourglass"];
export const BASE_RATES: Record<RegularSymbolId, number> = {
  ruby: 1.5, sapphire: 1.2, emerald: 1, amethyst: 0.8, crown: 3, goblet: 2.5, hourglass: 2,
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function randomGrid(): Cell[] {
  return Array.from({ length: 30 }, (_, index) => ({
    id: `${index}-${Math.random()}`,
    symbol: Math.random() < 0.05 ? "bolt" : REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)],
    multiplier: Math.random() < 0.045 ? [2, 3, 5, 10][Math.floor(Math.random() * 4)] : undefined,
  }));
}

export function evaluate(grid: Cell[], stake: number): { amount: number; winners: RegularSymbolId[]; bonus: boolean } {
  let amount = 0;
  const winners: RegularSymbolId[] = [];
  for (const symbol of REGULAR_SYMBOLS) {
    const matching = grid.filter(cell => cell.symbol === symbol);
    if (matching.length < 8) continue;
    winners.push(symbol);
    const multiplier = matching.reduce((sum, cell) => sum + (cell.multiplier ?? 0), 0) || 1;
    amount += round2(stake * BASE_RATES[symbol] * (1 + (matching.length - 8) * 0.35) * multiplier);
  }
  return { amount: round2(amount), winners, bonus: grid.filter(cell => cell.symbol === "bolt").length >= 4 };
}

export function createLossGrid(): Cell[] {
  for (let attempt = 0; attempt < 100; attempt++) {
    const grid = randomGrid();
    const ev = evaluate(grid, 1);
    if (!ev.amount && !ev.bonus) return grid;
  }
  return Array.from({ length: 30 }, (_, index) => ({ id: `loss-${index}`, symbol: REGULAR_SYMBOLS[index % 7] }));
}

function result(grid: Cell[], stake: number): SpinResult {
  const ev = evaluate(grid, stake);
  const winner = ev.winners[0] ?? null;
  const matching = grid.filter(cell => cell.symbol === winner);
  return { grid, winner, count: matching.length,
    multiplier: matching.reduce((sum, cell) => sum + (cell.multiplier ?? 0), 0) || 1,
    amount: ev.amount, bonus: ev.bonus };
}

export function prepareServerSpin(stake: number, won: boolean): SpinResult {
  if (!won) return result(createLossGrid(), stake);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const grid = createLossGrid();
    const symbol = REGULAR_SYMBOLS[Math.floor(Math.random() * 7)];
    const positions = Array.from({ length: 30 }, (_, index) => index);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    positions.slice(0, 8 + Math.floor(Math.random() * 5)).forEach(position => {
      grid[position] = { id: `win-${position}`, symbol };
    });
    const spin = result(grid, stake);
    if (!spin.bonus && evaluate(grid, stake).winners.length === 1 && spin.amount > stake && spin.amount <= round2(stake * 2)) return spin;
  }
  const grid = Array.from({ length: 30 }, (_, index) => ({
    id: `win-${index}`, symbol: index < 8 ? "ruby" as const : REGULAR_SYMBOLS[1 + (index % 6)],
  }));
  return result(grid, stake);
}

export function prepareServerSequence(stake: number, won: boolean): SpinResult[] {
  if (!won || Math.random() >= 0.12) return [prepareServerSpin(stake, won)];
  const grid = createLossGrid().map(cell => cell.symbol === "bolt" ? { ...cell, symbol: "amethyst" as const } : cell);
  for (let i = 0; i < 4; i++) grid[i] = { id: `bonus-${i}`, symbol: "bolt" };
  // The feature has one funded win; all six reels are prepared before settlement.
  const base = result(grid, stake);
  if (base.amount > 0) return [prepareServerSpin(stake, true)];
  const winningSpin = Math.floor(Math.random() * 6);
  return [base, ...Array.from({ length: 6 }, (_, index) => prepareServerSpin(stake, index === winningSpin))];
}
