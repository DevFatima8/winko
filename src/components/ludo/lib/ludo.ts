import { BET_PRESETS } from "@/lib/betPresets";

export const BETS: number[] = [...BET_PRESETS];
export type BetAmount = number;

export const STARTING_BALANCE = 50000;
export const PLAYER_WIN_RATE = 0.35;

export const COLORS = ["yellow", "green", "red", "blue"] as const;
export type PieceColor = (typeof COLORS)[number];

export const COLOR_META: Record<
  PieceColor,
  { main: string; dark: string; light: string; slot: string; label: string }
> = {
  yellow: { main: "#F0C41A", dark: "#C49200", light: "#FFE56A", slot: "#FFF3B0", label: "Yellow" },
  green: { main: "#2FAE4A", dark: "#1B7A2E", light: "#7CE08C", slot: "#B6F0C0", label: "Green" },
  red: { main: "#E23B32", dark: "#A51D16", light: "#FF8A82", slot: "#FFC4C0", label: "Red" },
  blue: { main: "#1E88E5", dark: "#0D5AA8", light: "#73B7FF", slot: "#BBDEFF", label: "Blue" },
};

/** Player 0 is always YOU (yellow, bottom-right). Clockwise: red → green → yellow → blue. */
export const PLAYER_COLOR: PieceColor[] = ["yellow", "green", "red", "blue"];
export const TURN_ORDER = [2, 1, 0, 3];

export const START_INDEX = [26, 13, 0, 39];

/** 52-square clockwise outer track on a 15×15 board. */
export const OUTER_PATH: readonly (readonly [number, number])[] = [
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
];

export const HOME_COORDS: readonly (readonly (readonly [number, number])[])[] = [
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
];

export const FINISH: readonly [number, number] = [7, 7];

export const YARD_SLOTS: readonly (readonly (readonly [number, number])[])[] = [
  [[10.35, 10.35], [10.35, 12.65], [12.65, 10.35], [12.65, 12.65]],
  [[1.35, 10.35], [1.35, 12.65], [3.65, 10.35], [3.65, 12.65]],
  [[1.35, 1.35], [1.35, 3.65], [3.65, 1.35], [3.65, 3.65]],
  [[10.35, 1.35], [10.35, 3.65], [12.65, 1.35], [12.65, 3.65]],
];

export const STAR_INDICES = [8, 21, 34, 47];
export const CHANCE_INDICES = [6, 19, 32, 45];
export const ARROW_INDICES = [2, 11, 15, 24, 28, 37, 41, 50];
export const BLOCK_INDICES = [12, 25, 38, 51];

export const OUTER_STEPS = 50;
export const HOME_STEPS = 5;
export const FINISH_STEPS = 55;

export const BOT_AVATARS = [
  "/images/avatar-1.png",
  "/images/avatar-2.png",
  "/images/avatar-3.png",
  "/images/avatar-4.png",
  "/images/avatar-5.png",
  "/images/avatar-6.png",
];

export const YOU_AVATAR = "/images/avatar-you.png";

export type Seat = {
  id: number;
  name: string;
  avatar: string;
  color: PieceColor;
  isYou: boolean;
};

export type Deal = {
  winner: number;
  bet: number;
  roomCode: string;
  txId: string;
  seed: number;
  players: Seat[];
  winPayout: number;
  bagReturn: number;
  bags: number[];
};

export type TokenState = {
  steps: number;
};

export type GameEvent =
  | { type: "turn"; player: number }
  | { type: "roll"; player: number; value: number }
  | { type: "out"; player: number; token: number }
  | {
      type: "move";
      player: number;
      token: number;
      fromSteps: number;
      toSteps: number;
      captured?: { player: number; token: number };
    }
  | { type: "bag"; player: number; amount: number }
  | { type: "home"; player: number; token: number }
  | { type: "win"; player: number };

const BOT_NAME_STYLES = [
  (n: number) => `****${n}`,
  (n: number) => `c${n}_su`,
  (n: number) => `p${n}k`,
  (n: number) => `m${n}_x`,
  (n: number) => `u${n}`,
  (n: number) => `lucky${n % 97}`,
];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isValidBet(bet: number): bet is BetAmount {
  return (BETS as readonly number[]).includes(bet);
}

export function formatMoney(n: number) {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted;
}

export function formatSigned(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "+";
  return `${sign}${formatMoney(Math.abs(n))}`;
}

export function cellStyle(row: number, col: number): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${(col / 15) * 100}%`,
    top: `${(row / 15) * 100}%`,
    width: `${100 / 15}%`,
    height: `${100 / 15}%`,
  };
}

export function tokenCenter(row: number, col: number): { left: string; top: string } {
  return {
    left: `${((col + 0.5) / 15) * 100}%`,
    top: `${((row + 0.5) / 15) * 100}%`,
  };
}

export function coordsForToken(player: number, token: number, steps: number): {
  row: number;
  col: number;
} {
  if (steps < 0) {
    const slot = YARD_SLOTS[player][token];
    return { row: slot[0], col: slot[1] };
  }
  if (steps >= FINISH_STEPS) {
    const offsets: readonly (readonly [number, number])[] = [
      [0.55, 0],
      [0, 0.55],
      [-0.55, 0],
      [0, -0.55],
    ];
    return { row: FINISH[0] + offsets[player][0], col: FINISH[1] + offsets[player][1] };
  }
  if (steps >= OUTER_STEPS) {
    const home = HOME_COORDS[player][steps - OUTER_STEPS];
    return { row: home[0], col: home[1] };
  }
  const idx = (START_INDEX[player] + steps) % 52;
  const pos = OUTER_PATH[idx];
  return { row: pos[0], col: pos[1] };
}

export function isSafeSteps(player: number, steps: number) {
  if (steps < 0 || steps >= OUTER_STEPS) return true;
  if (steps === 0) return true;
  const global = (START_INDEX[player] + steps) % 52;
  return STAR_INDICES.includes(global) || START_INDEX.includes(global);
}

export function createDeal(bet: number, seed: number): Deal {
  const rng = mulberry32(seed);
  const playerWins = rng() < PLAYER_WIN_RATE;
  const winner = playerWins ? 0 : 1 + Math.floor(rng() * 3);

  const usedAvatars = new Set<string>();
  const players: Seat[] = [];

  for (let i = 0; i < 4; i++) {
    if (i === 0) {
      players.push({
        id: 0,
        name: "YOU",
        avatar: YOU_AVATAR,
        color: "yellow",
        isYou: true,
      });
      continue;
    }
    let avatar = BOT_AVATARS[Math.floor(rng() * BOT_AVATARS.length)];
    while (usedAvatars.has(avatar)) {
      avatar = BOT_AVATARS[Math.floor(rng() * BOT_AVATARS.length)];
    }
    usedAvatars.add(avatar);
    const n = 100 + Math.floor(rng() * 900);
    const style = BOT_NAME_STYLES[Math.floor(rng() * BOT_NAME_STYLES.length)];
    players.push({
      id: i,
      name: style(n),
      avatar,
      color: PLAYER_COLOR[i],
      isYou: false,
    });
  }

  const bags = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const roll = rng();
    if (roll < 0.12) bags[i] = bet;
    else if (roll < 0.32) bags[i] = Math.round(bet * 0.5);
  }
  if (bags[winner] === 0 && rng() < 0.45) {
    bags[winner] = Math.round(bet * 0.5);
  }

  const roomCode = String(100000 + Math.floor(rng() * 900000));
  const txId = Array.from({ length: 32 }, () =>
    Math.floor(rng() * 16).toString(16),
  ).join("");

  return {
    winner,
    bet,
    roomCode,
    txId,
    seed,
    players,
    winPayout: Math.round(bet * 1.85),
    bagReturn: Math.round(bet * 0.125),
    bags,
  };
}

export function settlementFor(deal: Deal, player: number) {
  const win = player === deal.winner ? deal.winPayout : 0;
  const bag = deal.bags[player];
  const total = -deal.bet + win + bag + deal.bagReturn;
  return { entry: -deal.bet, win, bag, bagReturn: deal.bagReturn, total };
}

type Move = {
  token: number;
  fromSteps: number;
  toSteps: number;
  capture?: { player: number; token: number };
};

function furthest(tokens: TokenState[]) {
  let best = 0;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].steps > tokens[best].steps) best = i;
  }
  return best;
}

function validMoves(
  board: TokenState[][],
  player: number,
  dice: number,
): Move[] {
  const moves: Move[] = [];
  for (let t = 0; t < 4; t++) {
    const tok = board[player][t];
    if (tok.steps >= FINISH_STEPS) continue;
    if (tok.steps < 0) {
      if (dice === 6) {
        moves.push({ token: t, fromSteps: -1, toSteps: 0 });
      }
      continue;
    }
    const next = tok.steps + dice;
    if (next > FINISH_STEPS) continue;
    const move: Move = { token: t, fromSteps: tok.steps, toSteps: next };
    if (next < OUTER_STEPS && !isSafeSteps(player, next)) {
      const dest = coordsForToken(player, t, next);
      outer: for (let p = 0; p < 4; p++) {
        if (p === player) continue;
        for (let ot = 0; ot < 4; ot++) {
          const other = board[p][ot];
          if (other.steps < 0 || other.steps >= OUTER_STEPS) continue;
          if (isSafeSteps(p, other.steps)) continue;
          const oc = coordsForToken(p, ot, other.steps);
          if (oc.row === dest.row && oc.col === dest.col) {
            move.capture = { player: p, token: ot };
            break outer;
          }
        }
      }
    }
    moves.push(move);
  }
  return moves;
}

function pickMove(
  moves: Move[],
  player: number,
  winner: number,
  rng: () => number,
): Move | null {
  if (moves.length === 0) return null;

  const finishing = moves.filter((m) => m.toSteps >= FINISH_STEPS);
  if (player === winner) {
    if (finishing.length) return finishing[0];
    const captures = moves.filter((m) => m.capture);
    if (captures.length && rng() < 0.7) {
      captures.sort((a, b) => b.toSteps - a.toSteps);
      return captures[0];
    }
    const copy = [...moves].sort((a, b) => b.toSteps - a.toSteps);
    return copy[0];
  }

  if (finishing.length) {
    const nonFinish = moves.filter((m) => m.toSteps < FINISH_STEPS);
    if (nonFinish.length) return nonFinish[Math.floor(rng() * nonFinish.length)];
    return null;
  }
  if (rng() < 0.35) return moves[Math.floor(rng() * moves.length)];
  const copy = [...moves].sort((a, b) => a.toSteps - b.toSteps);
  return copy[0];
}

function rollDice(
  player: number,
  winner: number,
  board: TokenState[][],
  rng: () => number,
) {
  if (player === winner) {
    const lead = board[player][furthest(board[player])];
    if (lead.steps >= 0) {
      const dist = FINISH_STEPS - lead.steps;
      if (dist > 0 && dist <= 6 && rng() < 0.62) return dist;
    }
    if (rng() < 0.34) return 6;
    if (rng() < 0.22) return 5;
    return 1 + Math.floor(rng() * 6);
  }
  const lead = board[player][furthest(board[player])];
  if (lead.steps >= OUTER_STEPS - 2 && rng() < 0.7) {
    return 1 + Math.floor(rng() * 3);
  }
  if (rng() < 0.1) return 6;
  return 1 + Math.floor(rng() * 6);
}

export function simulateGame(deal: Deal): GameEvent[] {
  const rng = mulberry32(deal.seed ^ 0x9e3779b9);
  const board: TokenState[][] = [0, 1, 2, 3].map(() => [
    { steps: 0 },
    { steps: 0 },
    { steps: -1 },
    { steps: -1 },
  ]);

  const events: GameEvent[] = [];
  const collected = [false, false, false, false];
  const startPlayer = TURN_ORDER[Math.floor(rng() * 4)];
  let current = startPlayer;
  let guard = 0;
  let consecutiveSix = 0;

  const bagCells = [5, 16, 29, 42];

  while (guard < 96) {
    guard += 1;
    events.push({ type: "turn", player: current });
    const dice = rollDice(current, deal.winner, board, rng);
    events.push({ type: "roll", player: current, value: dice });

    if (dice === 6) consecutiveSix += 1;
    else consecutiveSix = 0;

    if (consecutiveSix >= 3) {
      consecutiveSix = 0;
      current = TURN_ORDER[(TURN_ORDER.indexOf(current) + 1) % 4];
      continue;
    }

    const moves = validMoves(board, current, dice);
    const chosen = pickMove(moves, current, deal.winner, rng);

    if (!chosen) {
      current = TURN_ORDER[(TURN_ORDER.indexOf(current) + 1) % 4];
      consecutiveSix = 0;
      continue;
    }

    board[current][chosen.token].steps = chosen.toSteps;
    const ev: GameEvent = {
      type: "move",
      player: current,
      token: chosen.token,
      fromSteps: chosen.fromSteps,
      toSteps: chosen.toSteps,
    };
    if (chosen.capture) {
      ev.captured = chosen.capture;
      board[chosen.capture.player][chosen.capture.token].steps = -1;
    }
    events.push(ev);

    if (chosen.toSteps >= OUTER_STEPS && chosen.toSteps < FINISH_STEPS) {
      events.push({ type: "home", player: current, token: chosen.token });
    }

    if (
      chosen.toSteps >= 0 &&
      chosen.toSteps < OUTER_STEPS &&
      !collected[current] &&
      deal.bags[current] > 0
    ) {
      const g = (START_INDEX[current] + chosen.toSteps) % 52;
      if (bagCells.includes(g) || rng() < 0.08) {
        collected[current] = true;
        events.push({ type: "bag", player: current, amount: deal.bags[current] });
      }
    }

    if (chosen.toSteps >= FINISH_STEPS) {
      if (current === deal.winner) {
        events.push({ type: "win", player: current });
        return events;
      }
      board[current][chosen.token].steps = OUTER_STEPS - 1;
    }

    const extra = dice === 6 || Boolean(chosen.capture);
    if (!extra) {
      current = TURN_ORDER[(TURN_ORDER.indexOf(current) + 1) % 4];
      consecutiveSix = 0;
    }
  }

  const w = deal.winner;
  const tok = furthest(board[w]);
  let pos = Math.max(board[w][tok].steps, 40);
  if (pos < 0) pos = 0;
  while (pos < FINISH_STEPS) {
    const step = Math.min(6, FINISH_STEPS - pos);
    events.push({ type: "turn", player: w });
    events.push({ type: "roll", player: w, value: step });
    events.push({
      type: "move",
      player: w,
      token: tok,
      fromSteps: pos,
      toSteps: pos + step,
    });
    pos += step;
  }
  events.push({ type: "win", player: w });
  return events;
}

export function nextCoordsOnMove(
  player: number,
  token: number,
  fromSteps: number,
  toSteps: number,
): { row: number; col: number }[] {
  const points: { row: number; col: number }[] = [];
  if (fromSteps < 0) {
    points.push(coordsForToken(player, token, -1));
    points.push(coordsForToken(player, token, 0));
    return points;
  }
  for (let s = fromSteps; s <= toSteps; s++) {
    points.push(coordsForToken(player, token, s));
  }
  return points;
}

export function randomBagCells(seed: number) {
  const rng = mulberry32(seed ^ 0x51ed);
  const picks = [5, 16, 29, 42];
  if (rng() > 0.4) picks.push(9);
  if (rng() > 0.5) picks.push(22);
  return picks;
}
