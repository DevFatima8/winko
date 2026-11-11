
import { dbConnect } from "./mongo";
import { isMysqlEnabled } from "./mysql";
import { Game, HelpArticle, PaymentAccount, Settings, User } from "@/models";
import { DEFAULT_HELP, DEFAULT_LEADERBOARD, DEFAULT_VIP } from "./platform";

const envStr = (name: string, fallback = "") => process.env[name]?.trim() || fallback;
const envNum = (name: string, fallback = 0) => {
  const v = Number(process.env[name] ?? fallback);
  return Number.isFinite(v) ? v : fallback;
};

const SUPER_ADMIN = {
  role: "admin",
  name: envStr("SUPER_ADMIN_NAME", "Super Admin"),
  phone: envStr("SUPER_ADMIN_PHONE", "03000000000"),
  username: envStr("SUPER_ADMIN_USERNAME", "superadmin"),
  adminId: envStr("SUPER_ADMIN_ID", "WX-ADM-0001"),
  password: envStr("SUPER_ADMIN_PASSWORD", "admin123"),
  level: 2,
};

/** ===== DEFAULT LOGIN ACCOUNTS (Real database mode only) ===== */
export const DEFAULT_ACCOUNTS = isMysqlEnabled()
  ? [{ role: "admin", name: SUPER_ADMIN.name, phone: SUPER_ADMIN.phone, username: SUPER_ADMIN.username, adminId: SUPER_ADMIN.adminId, password: SUPER_ADMIN.password }]
  : [{ role: "admin", name: SUPER_ADMIN.name, phone: SUPER_ADMIN.phone, username: SUPER_ADMIN.username, adminId: SUPER_ADMIN.adminId, password: SUPER_ADMIN.password }];

export async function cleanupDemoAccounts() {
  const demoFilters = [
    { username: { $in: ["system", "agent", "demo"] } },
    { adminId: { $in: ["WX-SYS-0000"] } },
    { phone: { $in: ["03999999999", "03000000001", "03007654321", "03001234567", "03211112222"] } },
    { name: { $in: ["System", "Ahmed Support", "Bilal Agent", "Demo Client"] } },
  ];

  await User.deleteMany({ $or: demoFilters });
}

export async function ensureAdmin() {
  const superAdmin = SUPER_ADMIN;
  const existing = await User.findOne({ $or: [{ phone: superAdmin.phone }, { adminId: superAdmin.adminId }, { username: superAdmin.username }] }).lean();
  if (!existing) {
    await User.create({
      name: superAdmin.name,
      phone: superAdmin.phone,
      username: superAdmin.username,
      adminId: superAdmin.adminId,
      role: "admin",
      passwordHash: "plain:" + superAdmin.password,
      passwordPlain: superAdmin.password,
      referralCode: null,
      balance: 0,
      totalDeposited: 0,
      vipLevel: 0,
      withdrawPin: null,
      referredBy: null,
      isActive: true,
      paymentDepositLimit: envNum("SUPER_ADMIN_DEPOSIT_LIMIT", 0),
      lastLoginAt: null,
      createdBy: null,
      adminNote: "Super admin created from environment variables",
    });
  }

  if (isMysqlEnabled()) {
    await cleanupDemoAccounts();
    return;
  }

  await cleanupDemoAccounts();
}

const GAMES = [
  { slug: "aviator", name: "Aviator", icon: "✈️", category: "original", description: "Plane udne se pehle cash out karein aur multiplier jeetein!" },
  { slug: "aviator-x", name: "Aviator X", icon: "🚀", category: "original", description: "Aviator ka X edition — 3 bets, neon sky, crash below 100x." },
  { slug: "chicken-road-2", name: "Chicken Road 2", icon: "🐔", category: "original", description: "Chicken ko road cross karwayein — har lane par multiplier barhta hai!" },
  { slug: "chicken-dash", name: "Chicken Dash", icon: "🐤", category: "original", description: "Busy highway cross karein — Dash boost aur Bonus Bag ke saath 100x tak!" },
  { slug: "plinko", name: "Plinko", icon: "🔴", category: "original", description: "Plinko: 25x scale marker (0% chance); payable buckets 0x, 0.2x, 0.9x and 1.3x." },
  { slug: "limbo", name: "Limbo", icon: "🎯", category: "original", description: "Target multiplier set karein — 100x tak instant result!" },
  { slug: "mines", name: "Mines", icon: "💎", category: "original", description: "5×5 grid, mines choose karein, gems kholen aur cash out — 10,000x tak!" },
  { slug: "lucky-777", name: "Lucky 777", icon: "🎰", category: "original", description: "Classic 3-reel slot — 7 7 7 par jackpot!" },
  { slug: "dragon-tiger", name: "Dragon Tiger", icon: "🐉", category: "wg-cards", description: "Live table — Dragon, Tiger ya Tie par bet lagayein. Bara card jeet-ta hai!" },
  { slug: "andar-bahar", name: "Andar Bahar", icon: "🃏", category: "wg-cards", description: "Live table — Joker ka match Andar aayega ya Bahar? Predict karein aur jeetein!" },
  { slug: "dice", name: "Dice Betting", icon: "🎲", category: "mini-games", description: "Dice roll karein aur jeetein!" },
  { slug: "dream-catcher", name: "Dream Catcher", icon: "🎡", category: "live", description: "Live casino wheel spin game." },
  { slug: "european-roulette", name: "European Roulette", icon: "🎰", category: "live", description: "Classic European Roulette table." },
  { slug: "evo-casino", name: "Evo Casino", icon: "🎧", category: "live", description: "Live dealer casino experience." },
  { slug: "fishing-arcade", name: "Fishing Arcade", icon: "🐟", category: "arcade", description: "Shoot fish and win multipliers!" },
  { slug: "football-studio", name: "Football Studio", icon: "⚽", category: "sports", description: "Sports betting themed card game." },
  { slug: "fortune-gems", name: "Fortune Gems", icon: "💎", category: "slot", description: "Slot machine with shiny gems." },
  { slug: "fortune-ox", name: "Fortune Ox", icon: "🐂", category: "slot", description: "Chinese New Year themed slot." },
  { slug: "fortune-toucan", name: "Fortune Toucan", icon: "🦜", category: "slot", description: "Tropical jungle themed slot game." },
  { slug: "gates-of-olympus", name: "Gates of Olympus", icon: "⚡", category: "slot", description: "Zeus themed epic slot game." },
  { slug: "head-tail", name: "Head & Tail", icon: "🪙", category: "mini-games", description: "Flip the coin for heads or tails." },
  { slug: "muflis", name: "Muflis Lowball", icon: "🃏", category: "cards", description: "Indian lowball card game." },
  { slug: "poker", name: "Poker", icon: "♠️", category: "cards", description: "Classic Texas Hold'em poker." },
  { slug: "rock-paper-scissors", name: "Rock Paper Scissors", icon: "✌️", category: "mini-games", description: "Rock, paper, scissors game." },
  { slug: "amar-akbar-anthony", name: "Amar Akbar Anthony", icon: "🎬", category: "cards", description: "Amar, Akbar ya Anthony par bet lagayein!" },
  { slug: "7-up-down", name: "7 Up Down", icon: "🎲", category: "mini-games", description: "Bet on dice total: Up, Down, or Lucky 7." },
  { slug: "nine-wickets", name: "9 Wickets Live", icon: "🏏", category: "sports", description: "Ball-by-ball cricket betting live." },
  { slug: "32-cards", name: "32 Cards", icon: "🃏", category: "cards", description: "Fast 32-card casino card game." },
  { slug: "auto-roulette", name: "Auto Roulette", icon: "🎡", category: "live", description: "Automated European Roulette table." },
  { slug: "blast-off", name: "Blast Off", icon: "🚀", category: "crash", description: "High-flying rocket crash game." },
  { slug: "bollywood-casino", name: "Bollywood Casino", icon: "💃", category: "cards", description: "Royal Andar Bahar desi casino table." },
  { slug: "casino-war", name: "Casino War", icon: "⚔️", category: "cards", description: "Beat the dealer with a higher card. Go to war on ties!" },
  { slug: "crash-bonus", name: "Crash Bonus", icon: "💥", category: "crash", description: "Multipliers rise high with bonus rounds. Cash out before the crash!" },
  { slug: "crash-cricket", name: "Crash Cricket", icon: "🏏", category: "crash", description: "Cricket ball flies into orbit! Cash out before the ball crashes." },
  { slug: "crash-goal", name: "Crash Goal", icon: "⚽", category: "crash", description: "Score a goal! The football flies high with the multiplier. Cash out before it bursts." },
  { slug: "derby-race", name: "Derby Race", icon: "🐎", category: "sports", description: "Bet on your favorite horses in an intense pixel art night race. First to cross the finish line wins big!" },
  { slug: "diao-chan", name: "Diao Chan", icon: "🌸", category: "slots", description: "Classic Asian slot theme with beautiful graphics. Spin to win!" },
  { slug: "baccarat", name: "Baccarat", icon: "🃏", category: "cards", description: "Baccarat card game." },
  { slug: "blackjack", name: "Blackjack", icon: "♠️", category: "cards", description: "Beat the dealer! Hit, stand, or double down to reach 21." },
  { slug: "birds-beasts", name: "Birds & Beasts", icon: "🦅", category: "arcade", description: "Place your bets on animals and birds wheel spin." },
  { slug: "race-betting", name: "Race Betting", icon: "🐎", category: "sports", description: "Bet on your favorite horse to win the race!" },
  { slug: "red-vs-black", name: "Red Vs Black", icon: "🔴", category: "cards", description: "Predict which side will win, Red or Black!" },
  { slug: "rummy", name: "Rummy", icon: "🃏", category: "cards", description: "Classic Rummy card game." },
  { slug: "sic-bo", name: "Sic Bo", icon: "🎲", category: "mini-games", description: "Predict the outcome of three dice rolls in Sic Bo." },
  { slug: "speed-baccarat", name: "Speed Baccarat", icon: "🃏", category: "cards", description: "Fast-paced Baccarat game." },
  { slug: "super-fruits", name: "Super Fruits", icon: "🍒", category: "slots", description: "Classic fruit slot machine." },
  { slug: "sweet-bonanza", name: "Sweet Bonanza", icon: "🍭", category: "slots", description: "Sweet candy slot machine with huge multipliers." },
  { slug: "tai-xiu", name: "Tai Xiu", icon: "🎲", category: "mini-games", description: "Asian dice game." },
  { slug: "teen-patti", name: "Teen Patti", icon: "🃏", category: "cards", description: "The classic Teen Patti card game." },
  { slug: "teen-patti-999", name: "Teen Patti 999", icon: "🃏", category: "cards", description: "Classic Indian Teen Patti game." },
  { slug: "teen-patti-ak47", name: "Teen Patti AK47", icon: "🃏", category: "cards", description: "Teen Patti with AK47 wildcards." },
  { slug: "teen-patti-best-of-four", name: "Teen Patti Best of Four", icon: "🃏", category: "cards", description: "Best of four hands wins." },
  { slug: "teen-patti-faceoff", name: "Teen Patti Faceoff", icon: "🃏", category: "cards", description: "A one-on-one Faceoff in Teen Patti." },
  { slug: "teen-patti-hukam", name: "Teen Patti Hukam", icon: "🃏", category: "cards", description: "Teen Patti with Hukam (Spades) wildcards." },
  { slug: "teen-patti-joker", name: "Teen Patti Joker", icon: "🃏", category: "cards", description: "Teen Patti with Joker cards." },
  { slug: "texas-holdem", name: "Texas Holdem", icon: "🃏", category: "cards", description: "Classic Texas Holdem Poker." },
  { slug: "thai-hi-lo", name: "Thai Hi Lo", icon: "🎲", category: "mini-games", description: "Traditional Thai dice game." },
  { slug: "three-card-poker", name: "Three Card Poker", icon: "🃏", category: "cards", description: "Classic Three Card Poker." },
  { slug: "three-cards", name: "Three Cards", icon: "🃏", category: "cards", description: "Simple three cards game." },
  { slug: "tower-betting", name: "Tower Betting", icon: "🗼", category: "mini-games", description: "Climb the tower to win." },
  { slug: "treasure-bowl", name: "Treasure Bowl", icon: "🥣", category: "slots", description: "Find the treasure in the bowl." },
  { slug: "wheel-betting", name: "Wheel Betting", icon: "🎡", category: "mini-games", description: "Spin the wheel to win." },
  { slug: "hotline", name: "Hotline Casino", icon: "🔥", category: "arcade", description: "Welcome to Miami in the 80s! Neon lights, fast cars, and big jackpots with 10x Fire multiplier!" },
  { slug: "keno", name: "Keno", icon: "🎱", category: "mini-games", description: "Pick your lucky numbers! Up to 10,000x multiplier with Classic, Low, and High risk." },
  { slug: "lightning-roulette", name: "Lightning Roulette", icon: "⚡", category: "live", description: "Extra chances to win with lucky lightning strikes on numbers up to 500x!" },
  { slug: "ludo", name: "Ludo Betting", icon: "🎲", category: "board", description: "Place bets on colors and roll the dice. Classic Ludo with a casino twist." },
  { slug: "mini-roulette", name: "Mini Roulette", icon: "🎡", category: "table", description: "A faster, 12-number version of roulette. Quick spins and higher chances!" },
  { slug: "monster-hilo", name: "Monster HiLo", icon: "👾", category: "cards", description: "Guess if the next card will be higher or lower. Climb the multiplier ladder!" },
  { slug: "poker-betting", name: "Poker Betting", icon: "♠️", category: "cards", description: "Bet on poker hands. Simple, fun and highly rewarding." },
  { slug: "poker-roulette", name: "Poker Roulette", icon: "🃏", category: "table", description: "A mix of poker and roulette! Bet on suits and cards on the roulette board." },
];
export async function ensureGames() {
  await Promise.all(GAMES.map(async (game) => {
    const exists = await Game.findOne({ slug: game.slug });
    if (!exists) {
      await Game.create({ ...game, isActive: true, isHot: false });
    }
  }));
}
export async function ensureHelp() { if ((await HelpArticle.countDocuments()) === 0) await HelpArticle.insertMany(DEFAULT_HELP as never); }
export async function ensureSettings() { if (!(await Settings.exists({ key: "main" }))) await Settings.create({ key: "main", vipLevels: DEFAULT_VIP, leaderboard: DEFAULT_LEADERBOARD }); }
export async function ensurePaymentAccounts() {
  if ((await PaymentAccount.countDocuments()) === 0) {
    await PaymentAccount.insertMany([{ provider: "jazzcash", accountTitle: "winkox Official", accountNumber: "03035433872", isActive: true }, { provider: "easypaisa", accountTitle: "winkox Official", accountNumber: "03035433872", isActive: true }]);
  }
}

let done = false;
export async function seedAll() {
  if (done) return;
  done = true;
  await Promise.all([ensureAdmin(), ensureGames(), ensureSettings(), ensureHelp(), ensurePaymentAccounts()]);
}
export { dbConnect };
