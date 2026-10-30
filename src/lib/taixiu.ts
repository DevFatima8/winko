export type Side = "tai" | "xiu";

export interface Round {
  id: string;
  dice: [number, number, number];
  total: number;
  side: Side;
  createdAt: string;
}

export interface Bet extends Round {
  prediction: Side;
  stake: number;
  payout: number;
  won: boolean;
}

export interface Session {
  balance: number;
  bets: Bet[];
  playerName: string;
  favorite: boolean;
  sound: boolean;
  breakUntil: number;
}

export type DialogName = "rules" | "fairness" | "wallet" | "leaderboard" | "lobby" | "favorites" | "support" | "profile" | "notifications" | "responsible" | "round" | null;

export const STARTING_BALANCE = 12500;
export const STORAGE_KEY = "taixiu-practice-v1";
export const WIN_CHANCE = 35;
export const DEFAULT_SESSION: Session = {
  balance: STARTING_BALANCE,
  bets: [],
  playerName: "Alex",
  favorite: false,
  sound: false,
  breakUntil: 0,
};

export const sideName = (side: Side) => side === "tai" ? "TÀI" : "XỈU";
export const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const roundMoney = (value: number) => Math.round(value * 100) / 100;
export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const exampleDice: [number, number, number][] = [
  [4, 5, 3], [1, 2, 4], [5, 2, 6], [4, 2, 5], [1, 3, 2],
  [3, 5, 6], [1, 2, 5], [3, 2, 4], [4, 5, 6], [5, 3, 4],
  [1, 4, 2], [4, 3, 5], [2, 1, 3], [2, 3, 4], [6, 2, 5],
  [5, 4, 6], [2, 1, 5], [4, 5, 3], [2, 3, 1], [5, 3, 6],
];

export const EXAMPLE_ROUNDS: Round[] = exampleDice.map((dice, index) => {
  const total = dice.reduce((sum, die) => sum + die, 0);
  return {
    id: `084${276 + index}`,
    dice,
    total,
    side: total >= 11 ? "tai" : "xiu",
    createdAt: "2026-04-12T12:00:00.000Z",
  };
});

export const DEMO_ACTIVITY = [
  { name: "lucky.ace", initials: "LA", color: "sage", prediction: "tai" as Side, stake: 500, dice: [5, 3, 6] as [number, number, number], won: true },
  { name: "Midnight", initials: "M", color: "purple", prediction: "xiu" as Side, stake: 250, dice: [5, 3, 6] as [number, number, number], won: false },
  { name: "goldrush", initials: "GR", color: "gold", prediction: "tai" as Side, stake: 1000, dice: [5, 3, 6] as [number, number, number], won: true },
  { name: "mira.x", initials: "MX", color: "rose", prediction: "tai" as Side, stake: 100, dice: [2, 3, 1] as [number, number, number], won: false },
  { name: "Velvet", initials: "V", color: "blue", prediction: "tai" as Side, stake: 500, dice: [2, 3, 1] as [number, number, number], won: false },
];

export function restoreSession(raw: string): Session {
  const data = JSON.parse(raw) as Partial<Session>;
  if (!data || typeof data !== "object") return DEFAULT_SESSION;
  const bets = Array.isArray(data.bets) ? data.bets.filter((bet): bet is Bet =>
    typeof bet?.id === "string" && typeof bet.createdAt === "string" &&
    Array.isArray(bet.dice) && bet.dice.length === 3 && bet.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6) &&
    (bet.side === "tai" || bet.side === "xiu") && (bet.prediction === "tai" || bet.prediction === "xiu") &&
    Number.isFinite(bet.stake) && bet.stake > 0 && Number.isFinite(bet.payout) &&
    Number.isFinite(bet.total) && typeof bet.won === "boolean"
  ).slice(0, 100) : [];
  return {
    balance: typeof data.balance === "number" && Number.isFinite(data.balance) && data.balance >= 0 ? Math.min(data.balance, 10000000) : STARTING_BALANCE,
    bets,
    playerName: typeof data.playerName === "string" && data.playerName.trim() ? data.playerName.trim().slice(0, 20) : DEFAULT_SESSION.playerName,
    favorite: data.favorite === true,
    sound: data.sound === true,
    breakUntil: typeof data.breakUntil === "number" && Number.isFinite(data.breakUntil) ? Math.min(data.breakUntil, Date.now() + 300000) : 0,
  };
}
