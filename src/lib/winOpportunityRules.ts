export const THIRTY_WIN_GAMES = [
  "andar-bahar", "dragon-tiger", "poker-roulette", "football-studio", "treasure-bowl", "race-betting",
  "limbo", "tower-betting", "wheel-betting", "tai-xiu", "thai-hi-lo", "rock-paper-scissors", "sic-bo",
  "7-up-down", "dice", "dream-catcher", "three-card-poker", "three-cards", "teen-patti-joker",
  "texas-holdem", "teen-patti-faceoff", "teen-patti-hukam", "teen-patti-ak47", "teen-patti-best-of-four",
  "teen-patti", "teen-patti-999", "speed-baccarat", "rummy", "red-vs-black", "muflis", "poker",
  "casino-war", "monster-hilo", "blackjack", "bollywood-casino", "baccarat", "amar-akbar-anthony",
  "32-cards", "ludo",
  "lucky-777", "fortune-ox", "fortune-gems", "fortune-toucan", "gates-of-olympus", "diao-chan",
  "super-fruits", "sweet-bonanza", "hotline",
] as const;

export const isThirtyWinGame = (game: string): game is typeof THIRTY_WIN_GAMES[number] =>
  THIRTY_WIN_GAMES.some(value => value === game);

export const WIN_OPPORTUNITY_RULES = [
  "Server-controlled outcomes: each game assigns 30 winning opportunities and 70 losing opportunities in each completed, non-overlapping cycle of 100 player-rounds across all players. These are not independent random casino odds, 30 unique winning players, or a guarantee for any rolling set of 100 rounds.",
  "Repeat players count again. Multiple chips, extra stakes and retries in the same round do not draw extra opportunities. Incomplete cycles need not contain 30 wins. Each game has its own persistent cycle.",
  "An opportunity is not guaranteed profit. Existing paytables, house deductions, return caps and partial returns still apply. Folds, surrender, cancellation, unsuccessful choices or continuing play can forfeit an opportunity. Rummy assigns fully meldable hands; Tower assigns a safe first pick, not nine guaranteed safe floors.",
  "Existing daily-pool mode is unchanged. If enabled for this game, a winning opportunity creates only a provisional claim: the 35% daily stake pool and, where applicable, the existing ten-paid-wagers-per-100 settlement selection can reduce or eliminate payment. The full pool rules appear below when that mode is enabled. Otherwise the existing instant payout contract applies.",
  "Limbo retains its cumulative payout budget of 35% of accepted stakes. A target hit may pay less than the stake or nothing when the budget is exhausted. Dice target percentages determine the paytable, not the actual chance of receiving a winning opportunity. Ludo losing rounds may still return bags or a partial stake; bag awards can even produce a net profit without winning the game.",
  "Personal dice/card/roulette results may differ between players; there is no shared dealer result for new personal rounds. Bets that cover all possible outcomes or cannot support both a winning and a losing opportunity are refused. Previously accepted rounds keep their original settlement rules.",
] as const;

export const SLOT_WIN_RULES = [
  "Server-controlled slot results, not independent random casino odds: each local slot, including Hotline, pays exactly 30 profitable wins and 70 zero-return losses per completed, non-overlapping cycle of 100 new paid rounds across all players.",
  "Profit means the confirmed wallet return exceeds that round's paid stake, after any house deduction. This is not 30 different winning players, a personal guarantee, a rolling-window guarantee or a fixed return-to-player percentage. Repeat players count for every new paid round.",
  "The existing 2x gross-return cap and each game's payout calculations remain. Lucky 777 retains its 2% house deduction; new winning spins exclude the one-cherry partial return and use capped two-cherry or higher-paying combinations.",
  "A paid spin and its included free-spin/feature sequence count once. Retries reuse the same result and payment. Invalid bets and rolled-back transactions consume no slot. Historic results and already accepted wagers keep their original contract.",
] as const;
