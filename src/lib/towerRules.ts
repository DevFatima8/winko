export const ROWS = 9;
export type Difficulty = "easy" | "medium" | "hard" | "expert" | "master";
export const DIFF: Record<Difficulty, { cols: number; safe: number; mults: number[] }> = {
  easy: { cols: 4, safe: 3, mults: [1.31, 1.74, 2.32, 3.1, 4.13, 5.51, 7.34, 9.79, 13.05] },
  medium: { cols: 3, safe: 2, mults: [1.47, 2.21, 3.31, 4.96, 7.44, 11.16, 16.74, 25.11, 37.67] },
  hard: { cols: 2, safe: 1, mults: [1.96, 3.92, 7.84, 15.68, 31.36, 62.72, 125.44, 250.88, 501.76] },
  expert: { cols: 3, safe: 1, mults: [2.94, 8.82, 26.46, 79.38, 238.14, 714.42, 2143.26, 6429.78, 19289.34] },
  master: { cols: 4, safe: 1, mults: [3.92, 15.68, 62.72, 250.88, 1003.52, 4014.08, 16056.32, 64225.28, 256901.12] },
};
export type TowerCell = "hidden" | "egg" | "dragon" | "egg-dim" | "dragon-dim";
export type TowerView = { difficulty: Difficulty; board: TowerCell[][]; level: number };
