import { Bet, Card, CardRank, RoundResult, SettledBet, Suit } from './types';

const SUITS: Suit[] = ['SPADE', 'HEART', 'CLUB', 'DIAMOND'];

const RANKS: { rank: CardRank; value: number }[] = [
  { rank: 'A', value: 1 },
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 11 },
  { rank: 'Q', value: 12 },
];

export function getCardColor(suit: Suit): 'RED' | 'BLACK' {
  return suit === 'HEART' || suit === 'DIAMOND' ? 'RED' : 'BLACK';
}

export function createFullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    const color = getCardColor(suit);
    for (const r of RANKS) {
      deck.push({
        id: `${suit}_${r.rank}_${Math.random().toString(36).substring(2, 7)}`,
        suit,
        rank: r.rank,
        value: r.value,
        color,
      });
    }
  }
  return deck;
}

// Fisher-Yates shuffle
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a legal Race 20-20 sequence of cards.
 * First suit to hit 5 cards ends the race!
 * Total cards is between 5 and 17.
 */
export function generateRaceSequence(forcedWinner?: Suit, forcedTotalCardsRange?: [number, number]): {
  cards: Card[];
  winningSuit: Suit;
  totalCards: number;
  totalPoints: number;
  suitCards: Record<Suit, Card[]>;
} {
  const deck = shuffleArray(createFullDeck());

  // Group deck cards by suit
  const cardsBySuit: Record<Suit, Card[]> = {
    SPADE: deck.filter((c) => c.suit === 'SPADE'),
    HEART: deck.filter((c) => c.suit === 'HEART'),
    CLUB: deck.filter((c) => c.suit === 'CLUB'),
    DIAMOND: deck.filter((c) => c.suit === 'DIAMOND'),
  };

  const winningSuit = forcedWinner || SUITS[Math.floor(Math.random() * SUITS.length)];
  const otherSuits = SUITS.filter((s) => s !== winningSuit);

  // If forced range is given, pick total cards within range (5 to 17)
  let targetTotalCards: number;
  if (forcedTotalCardsRange) {
    const min = Math.max(5, forcedTotalCardsRange[0]);
    const max = Math.min(17, forcedTotalCardsRange[1]);
    targetTotalCards = Math.floor(Math.random() * (max - min + 1)) + min;
  } else {
    // Natural distribution: 10-12 is most common in a 4-way race to 5
    const weights = [
      { cards: 5, weight: 1 },
      { cards: 6, weight: 2 },
      { cards: 7, weight: 4 },
      { cards: 8, weight: 7 },
      { cards: 9, weight: 12 },
      { cards: 10, weight: 18 },
      { cards: 11, weight: 20 },
      { cards: 12, weight: 16 },
      { cards: 13, weight: 10 },
      { cards: 14, weight: 6 },
      { cards: 15, weight: 3 },
      { cards: 16, weight: 1 },
      { cards: 17, weight: 1 },
    ];
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let rand = Math.random() * totalWeight;
    targetTotalCards = 11;
    for (const w of weights) {
      if (rand < w.weight) {
        targetTotalCards = w.cards;
        break;
      }
      rand -= w.weight;
    }
  }

  // Winning suit must have 5 cards. Total other cards = targetTotalCards - 5.
  // Each other suit must have between 0 and 4 cards, and their sum must equal otherCount.
  let otherCount = targetTotalCards - 5;
  // clamp between 0 and 12 (3 suits * max 4 cards = 12)
  otherCount = Math.max(0, Math.min(12, otherCount));

  const otherCounts: Record<Suit, number> = {
    [otherSuits[0]]: 0,
    [otherSuits[1]]: 0,
    [otherSuits[2]]: 0,
  } as Record<Suit, number>;

  let remainingToDistribute = otherCount;
  while (remainingToDistribute > 0) {
    const eligibleSuits = otherSuits.filter((s) => otherCounts[s] < 4);
    if (eligibleSuits.length === 0) break;
    const chosen = eligibleSuits[Math.floor(Math.random() * eligibleSuits.length)];
    otherCounts[chosen]++;
    remainingToDistribute--;
  }

  // Select 5 cards for winning suit
  const winningCards = cardsBySuit[winningSuit].slice(0, 5);
  // The 5th card of the winning suit MUST be the last card dealt
  const lastCard = winningCards[4];
  const priorWinningCards = winningCards.slice(0, 4);

  // Collect all other prior cards
  const priorOtherCards: Card[] = [];
  for (const s of otherSuits) {
    priorOtherCards.push(...cardsBySuit[s].slice(0, otherCounts[s]));
  }

  // Shuffle prior cards
  const allPriorCards = shuffleArray([...priorWinningCards, ...priorOtherCards]);

  // Final card is the 5th winning card!
  const finalSequence = [...allPriorCards, lastCard];

  // Organize by suit
  const suitCards: Record<Suit, Card[]> = {
    SPADE: [],
    HEART: [],
    CLUB: [],
    DIAMOND: [],
  };

  let totalPoints = 0;
  for (const c of finalSequence) {
    suitCards[c.suit].push(c);
    totalPoints += c.value;
  }

  return {
    cards: finalSequence,
    winningSuit,
    totalCards: finalSequence.length,
    totalPoints,
    suitCards,
  };
}

export function generateControlledRound(
  activeBets: Bet[],
  winRatio: number = 0.35
): {
  cards: Card[];
  winningSuit: Suit;
  totalCards: number;
  totalPoints: number;
  suitCards: Record<Suit, Card[]>;
} {
  // If player hasn't bet, generate completely fair random round
  if (activeBets.length === 0) {
    return generateRaceSequence();
  }

  // Determine whether this round should be a WIN or a LOSS for player
  const shouldWin = Math.random() < winRatio;

  // Inspect player's primary bets
  const suitBackBets = activeBets.filter((b) => b.type === 'SUIT_BACK');
  const suitLayBets = activeBets.filter((b) => b.type === 'SUIT_LAY');
  const redBet = activeBets.find((b) => b.type === 'COLOR_RED');
  const blackBet = activeBets.find((b) => b.type === 'COLOR_BLACK');
  const overCardBet = activeBets.find((b) => b.type === 'TOTAL_CARDS_OVER');
  const underCardBet = activeBets.find((b) => b.type === 'TOTAL_CARDS_UNDER');

  let chosenWinner: Suit | undefined;
  let chosenRange: [number, number] | undefined;

  if (shouldWin) {
    // Generate a winning outcome for the player
    if (suitBackBets.length > 0) {
      // Pick one of the suits player backed
      const chosen = suitBackBets[Math.floor(Math.random() * suitBackBets.length)];
      if (chosen.target) chosenWinner = chosen.target;
    } else if (suitLayBets.length > 0) {
      // Pick a suit player did NOT lay
      const laidSuits = suitLayBets.map((b) => b.target);
      const safeSuits = SUITS.filter((s) => !laidSuits.includes(s));
      if (safeSuits.length > 0) {
        chosenWinner = safeSuits[Math.floor(Math.random() * safeSuits.length)];
      }
    } else if (redBet && !blackBet) {
      chosenWinner = Math.random() < 0.5 ? 'HEART' : 'DIAMOND';
    } else if (blackBet && !redBet) {
      chosenWinner = Math.random() < 0.5 ? 'SPADE' : 'CLUB';
    }

    if (overCardBet && !underCardBet) {
      chosenRange = [11, 15];
    } else if (underCardBet && !overCardBet) {
      chosenRange = [5, 10];
    }
  } else {
    // Force a LOSS for the player (65% ratio)
    if (suitBackBets.length > 0) {
      const backedSuits = suitBackBets.map((b) => b.target);
      const losingSuits = SUITS.filter((s) => !backedSuits.includes(s));
      if (losingSuits.length > 0) {
        chosenWinner = losingSuits[Math.floor(Math.random() * losingSuits.length)];
      }
    } else if (suitLayBets.length > 0) {
      // Pick a suit player DID lay (so lay loses)
      const laidSuits = suitLayBets.map((b) => b.target).filter(Boolean) as Suit[];
      if (laidSuits.length > 0) {
        chosenWinner = laidSuits[Math.floor(Math.random() * laidSuits.length)];
      }
    } else if (redBet && !blackBet) {
      chosenWinner = Math.random() < 0.5 ? 'SPADE' : 'CLUB';
    } else if (blackBet && !redBet) {
      chosenWinner = Math.random() < 0.5 ? 'HEART' : 'DIAMOND';
    }

    if (overCardBet && !underCardBet) {
      chosenRange = [5, 10];
    } else if (underCardBet && !overCardBet) {
      chosenRange = [11, 16];
    }
  }

  return generateRaceSequence(chosenWinner, chosenRange);
}

/**
 * Settle all player bets against the finalized round result
 */
export function settleBets(bets: Bet[], result: RoundResult): {
  settled: SettledBet[];
  totalStake: number;
  totalPayout: number;
  netProfit: number;
} {
  let totalStake = 0;
  let totalPayout = 0;

  const settled: SettledBet[] = bets.map((bet) => {
    let won = false;
    let payout = 0;
    let profit = 0;

    const winnerColor = getCardColor(result.winningSuit);

    switch (bet.type) {
      case 'SUIT_BACK':
        won = bet.target === result.winningSuit;
        break;

      case 'SUIT_LAY':
        // Lay bet wins if the target suit DOES NOT win
        won = bet.target !== result.winningSuit;
        break;

      case 'COLOR_RED':
        won = winnerColor === 'RED';
        break;

      case 'COLOR_BLACK':
        won = winnerColor === 'BLACK';
        break;

      case 'TOTAL_CARDS_OVER':
        won = result.totalCards > 10.5;
        break;

      case 'TOTAL_CARDS_UNDER':
        won = result.totalCards < 10.5;
        break;

      case 'TOTAL_CARDS_ODD':
        won = result.totalCards % 2 !== 0;
        break;

      case 'TOTAL_CARDS_EVEN':
        won = result.totalCards % 2 === 0;
        break;

      case 'TOTAL_POINTS_OVER':
        won = result.totalPoints > 70.5;
        break;

      case 'TOTAL_POINTS_UNDER':
        won = result.totalPoints < 70.5;
        break;

      case 'TOTAL_POINTS_ODD':
        won = result.totalPoints % 2 !== 0;
        break;

      case 'TOTAL_POINTS_EVEN':
        won = result.totalPoints % 2 === 0;
        break;

      case 'CARDS_5_8':
        won = result.totalCards >= 5 && result.totalCards <= 8;
        break;

      case 'CARDS_9_12':
        won = result.totalCards >= 9 && result.totalCards <= 12;
        break;

      case 'CARDS_13_17':
        won = result.totalCards >= 13 && result.totalCards <= 17;
        break;
    }

    if (bet.isLay) {
      const liability = bet.stake * (bet.odds - 1);
      totalStake += liability;
      if (won) {
        // Lay bet wins -> returns liability + player keeps stake profit
        payout = liability + bet.stake;
        profit = bet.stake;
      } else {
        // Lay bet loses -> player loses the liability
        payout = 0;
        profit = -liability;
      }
    } else {
      totalStake += bet.stake;
      if (won) {
        payout = bet.stake * bet.odds;
        profit = payout - bet.stake;
      } else {
        payout = 0;
        profit = -bet.stake;
      }
    }

    totalPayout += payout;

    return {
      ...bet,
      won,
      payout,
      profit,
      roundId: result.roundId,
    };
  });

  const netProfit = totalPayout - totalStake;

  return {
    settled,
    totalStake,
    totalPayout,
    netProfit,
  };
}

// Generate unique Round ID
export function generateRoundId(): string {
  const prefix = 'R20';
  const timestamp = Date.now().toString().slice(-6);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}-${rand}`;
}
