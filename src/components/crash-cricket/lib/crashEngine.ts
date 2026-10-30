export type GamePhase = "BETTING" | "IN_FLIGHT" | "CRASHED";

export type OutcomeBucket = "WIN_35" | "LOSS_65";

export interface RoundHistoryItem {
  id: number;
  crashPoint: number;
  bucket: OutcomeBucket;
  dismissalType: string;
  hash: string;
  timestamp: string;
}

export interface LiveBetEntry {
  id: string;
  username: string;
  avatarColor: string;
  isUser: boolean;
  panelId?: 1 | 2;
  betAmount: number;
  targetCashout: number; // Where simulated player plans to cash out
  cashedOutAt: number | null;
  winAmount: number | null;
}

export interface UserBetRecord {
  id: string;
  roundId: number;
  panelId: 1 | 2;
  betAmount: number;
  cashedOutAt: number | null;
  crashPoint: number;
  profit: number;
  won: boolean;
  timestamp: string;
}

export interface TopWinItem {
  id: string;
  username: string;
  avatarColor: string;
  betAmount: number;
  multiplier: number;
  winAmount: number;
  date: string;
  roundHash: string;
}

const DISMISSAL_REASONS_LOW = [
  "CLEAN BOWLED! Middle Stump Cartwheeling!",
  "LBW! Plumb in Front of Wickets!",
  "CAUGHT BEHIND! Thick Outside Edge to Keeper!",
  "RUN OUT! Direct Hit at the Striker's End!",
  "HIT WICKET! Back Foot Clipped the Bails!",
];

const DISMISSAL_REASONS_MID = [
  "CAUGHT AT LONG-ON! Diving Boundary Catch!",
  "CAUGHT IN THE DEEP! Fielder Juggles on the Rope!",
  "STUMPED! Beaten in Flight by the Spinner!",
  "CAUGHT AT MID-WICKET! Spliced Straight Up!",
];

const DISMISSAL_REASONS_HIGH = [
  "BALL BURST IN ORBIT! Stadium Roof Impact!",
  "FLEW OUT OF THE STADIUM! Gone into the Night Sky!",
  "LIGHT TOWER IMPACT! Ball Exploded in Sparks!",
  "SUPER NOVA SIX! Maximum Trajectory Reached!",
];

export function getDismissalDescription(crashPoint: number): string {
  if (crashPoint < 1.85) {
    return DISMISSAL_REASONS_LOW[
      Math.floor(Math.random() * DISMISSAL_REASONS_LOW.length)
    ];
  }
  if (crashPoint < 6.0) {
    return DISMISSAL_REASONS_MID[
      Math.floor(Math.random() * DISMISSAL_REASONS_MID.length)
    ];
  }
  return DISMISSAL_REASONS_HIGH[
    Math.floor(Math.random() * DISMISSAL_REASONS_HIGH.length)
  ];
}

export function generateFakeSha256(): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 64; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Uses a 20-round shuffled shoe containing:
 */
class CrashDeckEngine {
  private shoe: OutcomeBucket[] = [];
  private totalGenerated = 0;
  private winBucketsCount = 0;
  private lossBucketsCount = 0;

  constructor() {
    this.refillAndShuffle();
  }

  private refillAndShuffle() {
    const nextShoe: OutcomeBucket[] = [];
    // 7 Wins (35%) and 13 Losses (65%) = 20 Rounds
    for (let i = 0; i < 7; i++) nextShoe.push("WIN_35");
    for (let i = 0; i < 13; i++) nextShoe.push("LOSS_65");

    // Fisher-Yates shuffle
    for (let i = nextShoe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = nextShoe[i];
      nextShoe[i] = nextShoe[j];
      nextShoe[j] = temp;
    }

    // Avoid more than 5 consecutive identical outcomes at shoe boundary for natural casino feel
    this.shoe = nextShoe;
  }

  public nextRoundOutcome(userTargetMultiplier?: number): {
    crashPoint: number;
    bucket: OutcomeBucket;
    dismissalType: string;
    hash: string;
  } {
    if (this.shoe.length === 0) {
      this.refillAndShuffle();
    }

    const bucket = this.shoe.pop()!;
    this.totalGenerated++;
    if (bucket === "WIN_35") {
      this.winBucketsCount++;
    } else {
      this.lossBucketsCount++;
    }

    let crashPoint = 1.0;

    if (bucket === "LOSS_65") {
      // 65% LOSS OUTCOME BUCKET
      const r = Math.random();
      if (r < 0.18) {
        // 18% of loss rounds: Instant Duck / Bowled on 1st ball (1.00x - 1.05x)
        crashPoint = Number((1.0 + Math.random() * 0.05).toFixed(2));
      } else if (r < 0.65) {
        // 47% of loss rounds: Early infield catch (1.06x - 1.45x)
        crashPoint = Number((1.06 + Math.random() * 0.39).toFixed(2));
      } else {
        crashPoint = Number((1.46 + Math.random() * 0.38).toFixed(2));
      }

      // If user set a low auto-cashout target (e.g. 1.50x), ensure a LOSS_65 round crashes below their target
      if (userTargetMultiplier && userTargetMultiplier > 1.05 && crashPoint >= userTargetMultiplier) {
        const cap = Math.max(1.01, userTargetMultiplier - 0.04);
        crashPoint = Number((1.0 + Math.random() * (cap - 1.0)).toFixed(2));
      }
    } else {
      const r = Math.random();
      if (r < 0.52) {
        // Solid Boundary 4xzone: 2.05x - 4.50x
        crashPoint = Number((2.05 + Math.random() * 2.45).toFixed(2));
      } else if (r < 0.84) {
        // Huge Sixer zone: 4.51x - 12.50x
        crashPoint = Number((4.51 + Math.random() * 7.99).toFixed(2));
      } else if (r < 0.96) {
        // Super Over Jackpot zone: 12.51x - 38.00x
        crashPoint = Number((12.51 + Math.random() * 25.49).toFixed(2));
      } else {
        // Stadium Orbit Mega Multiplier: 38.01x - 125.00x
        crashPoint = Number((38.01 + Math.random() * 86.99).toFixed(2));
      }

      // If user has a reasonable auto-cashout target (<= 3.50x), ensure WIN_35 clears it
      if (
        userTargetMultiplier &&
        userTargetMultiplier <= 3.5 &&
        crashPoint < userTargetMultiplier + 0.15
      ) {
        crashPoint = Number(
          (userTargetMultiplier + 0.15 + Math.random() * 1.8).toFixed(2)
        );
      }
    }

    return {
      crashPoint: Math.max(1.0, crashPoint),
      bucket,
      dismissalType: getDismissalDescription(crashPoint),
      hash: generateFakeSha256(),
    };
  }

  public getStats() {
    const total = this.totalGenerated || 1;
    return {
      totalGenerated: this.totalGenerated,
      winBucketsCount: this.winBucketsCount,
      lossBucketsCount: this.lossBucketsCount,
      winPercentage: Number(((this.winBucketsCount / total) * 100).toFixed(1)),
      lossPercentage: Number(((this.lossBucketsCount / total) * 100).toFixed(1)),
      remainingInShoe: this.shoe.length,
    };
  }
}

export const crashDeckEngine = new CrashDeckEngine();

export function generateInitialHistory(): RoundHistoryItem[] {
  const items: RoundHistoryItem[] = [];
  const presetMultipliers: { val: number; bucket: OutcomeBucket }[] = [
    { val: 1.24, bucket: "LOSS_65" },
    { val: 3.45, bucket: "WIN_35" },
    { val: 1.08, bucket: "LOSS_65" },
    { val: 1.52, bucket: "LOSS_65" },
    { val: 14.8, bucket: "WIN_35" },
    { val: 1.15, bucket: "LOSS_65" },
    { val: 1.76, bucket: "LOSS_65" },
    { val: 2.64, bucket: "WIN_35" },
    { val: 1.0, bucket: "LOSS_65" },
    { val: 1.38, bucket: "LOSS_65" },
    { val: 5.92, bucket: "WIN_35" },
    { val: 1.19, bucket: "LOSS_65" },
    { val: 1.67, bucket: "LOSS_65" },
    { val: 28.4, bucket: "WIN_35" },
    { val: 1.41, bucket: "LOSS_65" },
    { val: 1.04, bucket: "LOSS_65" },
    { val: 2.18, bucket: "WIN_35" },
    { val: 1.29, bucket: "LOSS_65" },
    { val: 4.12, bucket: "WIN_35" },
    { val: 1.58, bucket: "LOSS_65" },
  ];

  presetMultipliers.forEach((p, idx) => {
    items.push({
      id: 8420 + idx,
      crashPoint: p.val,
      bucket: p.bucket,
      dismissalType: getDismissalDescription(p.val),
      hash: generateFakeSha256(),
      timestamp: new Date(Date.now() - (20 - idx) * 18000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    });
  });

  return items.reverse(); // Most recent first
}

const SIMULATED_PLAYERS = [
  { name: "Babar_56", color: "#00E701" },
  { name: "KingKohli_18", color: "#38BDF8" },
  { name: "Shahid_Boom", color: "#FFB800" },
  { name: "Raja_Bet786", color: "#F43F5E" },
  { name: "Zain_Lahore", color: "#A855F7" },
  { name: "LuckySixer", color: "#10B981" },
  { name: "Sultan_PK", color: "#EC4899" },
  { name: "Dhoni_Finisher", color: "#F59E0B" },
  { name: "Wasim_Swing", color: "#06B6D4" },
  { name: "Hamza_VIP", color: "#8B5CF6" },
  { name: "CricketBoss99", color: "#22C55E" },
  { name: "Shoaib_161kph", color: "#EF4444" },
  { name: "Asif_Sixes", color: "#14B8A6" },
  { name: "Mahi_07", color: "#EAB308" },
  { name: "Bilal_Khi", color: "#3B82F6" },
  { name: "Tariq_HighRoller", color: "#D946EF" },
  { name: "Salman_Pro", color: "#00E701" },
  { name: "gayle_storm333", color: "#F97316" },
  { name: "BoundaryHunter", color: "#38BDF8" },
  { name: "Imran_92Cup", color: "#10B981" },
];

const STAKE_OPTIONS = [50, 100, 200, 250, 500, 1000, 1500, 2500, 5000];

export function generateSimulatedBetsForRound(): LiveBetEntry[] {
  const count = 12 + Math.floor(Math.random() * 7); // 12 to 18 active players
  const shuffled = [...SIMULATED_PLAYERS].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  return selected.map((player, idx) => {
    const betAmount =
      STAKE_OPTIONS[Math.floor(Math.random() * STAKE_OPTIONS.length)];
    // Target cashout between 1.20x and 8.50x
    const r = Math.random();
    let targetCashout = 1.5;
    if (r < 0.45) {
      targetCashout = Number((1.22 + Math.random() * 0.75).toFixed(2));
    } else if (r < 0.85) {
      targetCashout = Number((2.0 + Math.random() * 2.2).toFixed(2));
    } else {
      targetCashout = Number((4.5 + Math.random() * 8.0).toFixed(2));
    }

    return {
      id: `sim-${Date.now()}-${idx}`,
      username: player.name,
      avatarColor: player.color,
      isUser: false,
      betAmount,
      targetCashout,
      cashedOutAt: null,
      winAmount: null,
    };
  });
}

export const INITIAL_TOP_WINS: TopWinItem[] = [
  {
    id: "tw-1",
    username: "Tariq_HighRoller",
    avatarColor: "#D946EF",
    betAmount: 5000,
    multiplier: 94.6,
    winAmount: 473000,
    date: "Today, 21:14",
    roundHash: "9f4b2c81e0a374b5d1c6e8f9a0b2c4d6",
  },
  {
    id: "tw-2",
    username: "Shahid_Boom",
    avatarColor: "#FFB800",
    betAmount: 2500,
    multiplier: 62.45,
    winAmount: 156125,
    date: "Today, 20:42",
    roundHash: "3a7d1e95c4b280f6a1e3c5d7f9b0a2e4",
  },
  {
    id: "tw-3",
    username: "KingKohli_18",
    avatarColor: "#38BDF8",
    betAmount: 5000,
    multiplier: 28.4,
    winAmount: 142000,
    date: "Today, 19:58",
    roundHash: "7c2e9a41f6b803d5e7a9c1f3b5d7e9a1",
  },
  {
    id: "tw-4",
    username: "Babar_56",
    avatarColor: "#00E701",
    betAmount: 3000,
    multiplier: 34.15,
    winAmount: 102450,
    date: "Today, 18:19",
    roundHash: "5e1a8d32b7c904f6a2d4e6f8b0c2d4e6",
  },
  {
    id: "tw-5",
    username: "Raja_Bet786",
    avatarColor: "#F43F5E",
    betAmount: 2000,
    multiplier: 41.8,
    winAmount: 83600,
    date: "Today, 17:05",
    roundHash: "1b6f4c90d2e835a7c9e1f3a5b7d9e1c3",
  },
  {
    id: "tw-6",
    username: "Zain_Lahore",
    avatarColor: "#A855F7",
    betAmount: 1500,
    multiplier: 38.9,
    winAmount: 58350,
    date: "Today, 16:33",
    roundHash: "8d3c7a19e5f204b6d8f0a2c4e6b8d0f2",
  },
];
