/* ------------------------------------------------------------------ */
/*  9 Wickets – game engine (pure logic, no database, no server)       */
/* ------------------------------------------------------------------ */

export type Phase = "betting" | "bowling" | "result";

export type OutcomeId = "dot" | "single" | "two" | "four" | "six" | "wicket";

export interface OutcomeInfo {
  id: OutcomeId;
  label: string;
  banner: string;
  chip: string;
  runs: number;
  /** natural probability weight of the ball when nobody bets on it */
  weight: number;
}

export const OUTCOMES: Record<OutcomeId, OutcomeInfo> = {
  dot: { id: "dot", label: "Dot Ball", banner: "DOT BALL", chip: "0", runs: 0, weight: 28 },
  single: { id: "single", label: "1 Run", banner: "1 RUN", chip: "1", runs: 1, weight: 30 },
  two: { id: "two", label: "2 Runs", banner: "2 RUNS", chip: "2", runs: 2, weight: 10 },
  four: { id: "four", label: "Four", banner: "FOUR!", chip: "4", runs: 4, weight: 14 },
  six: { id: "six", label: "Six", banner: "SIX!", chip: "6", runs: 6, weight: 8 },
  wicket: { id: "wicket", label: "Wicket", banner: "WICKET!", chip: "W", runs: 0, weight: 10 },
};

export const OUTCOME_IDS: OutcomeId[] = ["dot", "single", "two", "four", "six", "wicket"];

export const CHIP_STYLES: Record<OutcomeId, string> = {
  dot: "bg-slate-600 text-white",
  single: "bg-sky-600 text-white",
  two: "bg-emerald-600 text-white",
  four: "bg-amber-400 text-slate-950",
  six: "bg-fuchsia-600 text-white",
  wicket: "bg-red-600 text-white",
};

/* ------------------------------ markets ---------------------------- */

export interface Market {
  id: string;
  label: string;
  hint: string;
  badge: string;
  odds: number;
  covers: OutcomeId[];
  badgeClass: string;
}

export const MARKETS: Market[] = [
  { id: "dot", label: "Dot Ball", hint: "No run scored", badge: "0", odds: 2.8, covers: ["dot"], badgeClass: CHIP_STYLES.dot },
  { id: "single", label: "1 Run", hint: "A quick single", badge: "1", odds: 2.6, covers: ["single"], badgeClass: CHIP_STYLES.single },
  { id: "two", label: "2 Runs", hint: "Running twos", badge: "2", odds: 6.0, covers: ["two"], badgeClass: CHIP_STYLES.two },
  { id: "four", label: "FOUR", hint: "Ball hits the rope", badge: "4", odds: 5.0, covers: ["four"], badgeClass: CHIP_STYLES.four },
  { id: "six", label: "SIX", hint: "Over the boundary", badge: "6", odds: 9.0, covers: ["six"], badgeClass: CHIP_STYLES.six },
  { id: "wicket", label: "WICKET", hint: "Batter is out", badge: "W", odds: 7.0, covers: ["wicket"], badgeClass: CHIP_STYLES.wicket },
  {
    id: "boundary",
    label: "Boundary",
    hint: "Four or Six",
    badge: "4·6",
    odds: 3.2,
    covers: ["four", "six"],
    badgeClass: "bg-gradient-to-br from-amber-400 to-fuchsia-600 text-white",
  },
  {
    id: "runs",
    label: "Runs 1-2",
    hint: "One or two runs",
    badge: "1·2",
    odds: 2.2,
    covers: ["single", "two"],
    badgeClass: "bg-gradient-to-br from-sky-600 to-emerald-600 text-white",
  },
];


const BAG_SIZE = 20;
const BAG_WINS = 7; // 7 / 20 = 35 %

/** Win probability of every bet placed in the game. */
export const WIN_RATE = BAG_WINS / BAG_SIZE; // 0.35
export const LOSS_RATE = 1 - WIN_RATE; // 0.65

/**
 * Builds a shuffled "bag" of results: exactly 7 wins and 13 losses.
 */
export function createBag(): boolean[] {
  const bag = Array.from({ length: BAG_SIZE }, (_, i) => i < BAG_WINS);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function drawFromBag(bag: boolean[]): boolean {
  if (bag.length === 0) bag.push(...createBag());
  return bag.pop() as boolean;
}

function weightedPick(ids: OutcomeId[]): OutcomeId {
  const total = ids.reduce((sum, id) => sum + OUTCOMES[id].weight, 0);
  let r = Math.random() * total;
  for (const id of ids) {
    r -= OUTCOMES[id].weight;
    if (r <= 0) return id;
  }
  return ids[ids.length - 1];
}

export interface BallResult {
  outcome: OutcomeId;
  win: boolean;
}

/**
 * Decides the next ball.
 * - With a bet: the win / loss is drawn from the 35/65 bag, then a ball that
 *   matches (win) or does not match (loss) the chosen market is produced.
 * - Without a bet: a natural random ball is bowled.
 */
export function resolveBall(market: Market | null, bag: boolean[]): BallResult {
  if (!market) {
    return { outcome: weightedPick(OUTCOME_IDS), win: false };
  }
  const win = drawFromBag(bag);
  const pool = win ? market.covers : OUTCOME_IDS.filter((id) => !market.covers.includes(id));
  return { outcome: weightedPick(pool), win };
}

/* ------------------------------- types ----------------------------- */

export interface ActiveBet {
  marketId: string;
  stake: number;
  odds: number;
}

export interface BetRecord {
  id: number;
  marketLabel: string;
  stake: number;
  odds: number;
  outcome: OutcomeId;
  win: boolean;
  payout: number;
}

export interface BallRecord {
  id: number;
  outcome: OutcomeId;
  /** null = no bet placed on that ball */
  won: boolean | null;
}

export interface Stats {
  bets: number;
  wins: number;
  wagered: number;
  returned: number;
}

/* ------------------------------- match ----------------------------- */

export interface TeamInfo {
  code: string;
  name: string;
  flag: string;
  color: string;
}

export const TEAMS: [TeamInfo, TeamInfo] = [
  { code: "PAK", name: "Pakistan", flag: "🇵🇰", color: "#16a34a" },
  { code: "IND", name: "India", flag: "🇮🇳", color: "#2563eb" },
];

export interface Match {
  innings: 1 | 2;
  batting: 0 | 1;
  runs: number;
  wickets: number;
  balls: number;
  target: number | null;
  thisOver: OutcomeId[];
}

export const INITIAL_MATCH: Match = {
  innings: 1,
  batting: 0,
  runs: 86,
  wickets: 2,
  balls: 57,
  target: null,
  thisOver: ["single", "dot", "four"],
};

export function formatOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function runRate(runs: number, balls: number): string {
  if (balls === 0) return "0.00";
  return ((runs * 6) / balls).toFixed(2);
}

export function applyBall(m: Match, o: OutcomeId): { match: Match; note: string | null } {
  const info = OUTCOMES[o];
  const balls = m.balls + 1;
  const runs = m.runs + info.runs;
  const wickets = m.wickets + (o === "wicket" ? 1 : 0);
  const ballInOver = ((balls - 1) % 6) + 1;
  const thisOver = ballInOver === 1 ? [o] : [...m.thisOver, o];
  const next: Match = { ...m, balls, runs, wickets, thisOver };

  const batting = TEAMS[m.batting];
  const bowling = TEAMS[m.batting === 0 ? 1 : 0];
  const target = m.target ?? 0;
  const chased = m.innings === 2 && runs >= target;
  const finished = wickets >= 10 || balls >= 120 || chased;

  if (!finished) return { match: next, note: null };

  if (m.innings === 1) {
    return {
      match: {
        innings: 2,
        batting: m.batting === 0 ? 1 : 0,
        runs: 0,
        wickets: 0,
        balls: 0,
        target: runs + 1,
        thisOver: [],
      },
      note: `Innings break! ${batting.code} finish on ${runs}/${wickets}. ${bowling.code} need ${runs + 1} to win.`,
    };
  }

  const margin = target - 1 - runs;
  const note = chased
    ? `${batting.code} chase it down with ${10 - wickets} wickets in hand! A new match begins…`
    : margin === 0
      ? "What a finish – the match is TIED! A new match begins…"
      : `${bowling.code} win by ${margin} runs! A new match begins…`;

  return {
    match: { innings: 1, batting: 0, runs: 0, wickets: 0, balls: 0, target: null, thisOver: [] },
    note,
  };
}

/* ---------------------------- commentary --------------------------- */

const COMMENTARY: Record<OutcomeId, string[]> = {
  dot: [
    "Solid defence, no run. Dot ball!",
    "Beaten all ends! The keeper collects it cleanly.",
    "Tight line and length – nothing on offer.",
  ],
  single: [
    "Worked into the gap, they scamper through for a single.",
    "Pushed to mid-off, easy single taken.",
    "Nudged away off the pads for one.",
  ],
  two: [
    "Placed into the deep – they come back for the second!",
    "Excellent running between the wickets, two runs.",
    "Timed into the gap, the fielder chases it down. Two!",
  ],
  four: [
    "CRACK! That races away to the rope for FOUR!",
    "Gorgeous cover drive – four runs!",
    "Pierces the gap, nobody is catching that. FOUR!",
  ],
  six: [
    "HUGE! That's launched over the ropes – SIX!",
    "Out of the ground! What a strike – SIX!",
    "Down the ground and into the stands. Maximum!",
  ],
  wicket: [
    "BOWLED HIM! The stumps are shattered – WICKET!",
    "Castled! Absolute peach of a delivery. WICKET!",
    "Clean bowled! The bowler is pumped up!",
  ],
};

export function pickCommentary(o: OutcomeId): string {
  const lines = COMMENTARY[o];
  return lines[Math.floor(Math.random() * lines.length)];
}

export function formatCoins(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export const START_BALANCE = 10000;
export const MIN_BET = 10;
export const BETTING_SECONDS = 10;
/** time (ms) from "bowl" until the ball result is decided and the bet is settled */
export const BOWL_DURATION: Record<OutcomeId, number> = {
  dot: 4300,
  single: 5400,
  two: 6500,
  four: 5000,
  six: 5600,
  wicket: 5000,
};

export function bowlMs(o: OutcomeId): number {
  return BOWL_DURATION[o];
}

/** when the big on-screen banner pops (seconds after the bowler starts) */
export const BANNER_DELAY: Record<OutcomeId, number> = {
  dot: 3.0,
  single: 3.6,
  two: 4.3,
  four: 4.2,
  six: 4.6,
  wicket: 3.3,
};

/** the scene keeps playing (celebrations, runs) while the result is shown */
export const RESULT_MS = 3400;
