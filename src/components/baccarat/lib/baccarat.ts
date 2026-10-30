// Baccarat game engine with a controlled win/loss ratio.

export type Suit = "♠" | "♥" | "♦" | "♣";
export type BetType = "player" | "banker" | "tie";
export type Winner = "player" | "banker" | "tie";

export interface Card {
  rank: string; // "A", "2".."10", "J", "Q", "K"
  suit: Suit;
  value: number; // baccarat value
}

export interface RoundResult {
  playerCards: Card[];
  bankerCards: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: Winner;
}

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export const WIN_PROBABILITY = 0.35;

function cardValue(rank: string): number {
  if (rank === "A") return 1;
  if (rank === "10" || rank === "J" || rank === "Q" || rank === "K") return 0;
  return parseInt(rank, 10);
}

function buildDeck(): Card[] {
  // 8 decks like real baccarat shoe
  const deck: Card[] = [];
  for (let d = 0; d < 8; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit, value: cardValue(rank) });
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handTotal(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + c.value, 0) % 10;
}

// Standard baccarat third-card drawing rules.
function playRound(deck: Card[]): RoundResult {
  const playerCards: Card[] = [deck.pop()!, deck.pop()!];
  const bankerCards: Card[] = [deck.pop()!, deck.pop()!];

  let pTotal = handTotal(playerCards);
  let bTotal = handTotal(bankerCards);

  const isNatural = pTotal >= 8 || bTotal >= 8;

  if (!isNatural) {
    let playerThird: Card | null = null;

    // Player draws on 0-5, stands on 6-7
    if (pTotal <= 5) {
      playerThird = deck.pop()!;
      playerCards.push(playerThird);
      pTotal = handTotal(playerCards);
    }

    // Banker drawing rules
    const drawBanker = () => {
      bankerCards.push(deck.pop()!);
      bTotal = handTotal(bankerCards);
    };

    if (playerThird === null) {
      // Player stood, banker draws on 0-5
      if (bTotal <= 5) drawBanker();
    } else {
      const p3 = playerThird.value;
      if (bTotal <= 2) {
        drawBanker();
      } else if (bTotal === 3 && p3 !== 8) {
        drawBanker();
      } else if (bTotal === 4 && p3 >= 2 && p3 <= 7) {
        drawBanker();
      } else if (bTotal === 5 && p3 >= 4 && p3 <= 7) {
        drawBanker();
      } else if (bTotal === 6 && (p3 === 6 || p3 === 7)) {
        drawBanker();
      }
    }
  }

  let winner: Winner;
  if (pTotal > bTotal) winner = "player";
  else if (bTotal > pTotal) winner = "banker";
  else winner = "tie";

  return {
    playerCards,
    bankerCards,
    playerTotal: pTotal,
    bankerTotal: bTotal,
    winner,
  };
}

/** Unbiased round for no-stake live (spectator) hands. */
export function dealFairRound(): RoundResult {
  return playRound(buildDeck());
}

// Generate a round whose winner matches the desired outcome.
function generateRoundForWinner(desired: Winner): RoundResult {
  for (let attempts = 0; attempts < 2000; attempts++) {
    const deck = buildDeck();
    const result = playRound(deck);
    if (result.winner === desired) return result;
  }
  // Fallback (extremely unlikely): just return any round
  return playRound(buildDeck());
}

/**
 * Deals a round rigged to the target win ratio.
 * - With WIN_PROBABILITY the player's bet wins.
 * - Otherwise the player loses (opposite side wins, never a push).
 */
export function dealRiggedRound(bet: BetType): RoundResult {
  const playerShouldWin = Math.random() < WIN_PROBABILITY;

  let desired: Winner;

  if (playerShouldWin) {
    // Winning means the round winner equals the bet.
    desired = bet;
  } else {
    // Losing: pick an outcome that is NOT the bet (and not a push for the bet).
    if (bet === "player") {
      // Banker wins (a tie would be a push, so avoid it).
      desired = "banker";
    } else if (bet === "banker") {
      desired = "player";
    } else {
      // bet === "tie": any non-tie result loses the tie bet.
      desired = Math.random() < 0.5 ? "player" : "banker";
    }
  }

  return generateRoundForWinner(desired);
}

// Payout multipliers (total returned including stake).
export const PAYOUTS: Record<BetType, number> = {
  player: 2, // 1:1
  banker: 1.95, // 1:1 minus 5% commission
  tie: 9, // 8:1
};

export function settleBet(
  bet: BetType,
  amount: number,
  winner: Winner
): { won: boolean; payout: number; net: number } {
  const won = bet === winner;
  if (won) {
    const payout = Math.round(amount * PAYOUTS[bet]);
    return { won: true, payout, net: payout - amount };
  }
  return { won: false, payout: 0, net: -amount };
}
