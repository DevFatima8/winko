import { dbConnect } from "./mongo";
import { notifyUser } from "./notifications";
import { ensurePaymentAccounts } from "./seed";
import { assignAccounts } from "./paymentAssignments";
import { nextPakistanMidnight } from "./providerWinnings";
import { Commission, HelpArticle, PaymentAccount, Settings, Transaction, User, type PaymentAccountDoc, type SettingsDoc, type UserDoc, type ObjectId } from "@/models";

// VIP defaults modelled on 9K-style tiers (PKR). Admin can edit in panel.
export const DEFAULT_VIP = [
  { level: 0, name: "-", minDeposit: 0, nextLevelBonus: 0, dailyWithdrawLimit: 1000, withdrawalsPerDay: 1, perWithdrawMax: 1000, minWithdraw: 1000 },
  { level: 1, name: "Bronze", minDeposit: 300, nextLevelBonus: 10, dailyWithdrawLimit: 5000, withdrawalsPerDay: 2, perWithdrawMax: 5000, minWithdraw: 1000 },
  { level: 2, name: "Silver", minDeposit: 2300, nextLevelBonus: 50, dailyWithdrawLimit: 15000, withdrawalsPerDay: 3, perWithdrawMax: 15000, minWithdraw: 1000 },
  { level: 3, name: "Gold", minDeposit: 5000, nextLevelBonus: 100, dailyWithdrawLimit: 50000, withdrawalsPerDay: 4, perWithdrawMax: 50000, minWithdraw: 1000 },
  { level: 4, name: "Platinum", minDeposit: 10000, nextLevelBonus: 300, dailyWithdrawLimit: 100000, withdrawalsPerDay: 5, perWithdrawMax: 100000, minWithdraw: 1000 },
  { level: 5, name: "Diamond", minDeposit: 15000, nextLevelBonus: 500, dailyWithdrawLimit: 300000, withdrawalsPerDay: 6, perWithdrawMax: 300000, minWithdraw: 1000 },
  { level: 6, name: "Royal Gold", minDeposit: 30000, nextLevelBonus: 700, dailyWithdrawLimit: 1000000, withdrawalsPerDay: 7, perWithdrawMax: 1000000, minWithdraw: 1000 },
  { level: 7, name: "Royal Diamond", minDeposit: 50000, nextLevelBonus: 1000, dailyWithdrawLimit: 3000000, withdrawalsPerDay: 8, perWithdrawMax: 3000000, minWithdraw: 1000 },
  { level: 8, name: "Black Diamond", minDeposit: 100000, nextLevelBonus: 2000, dailyWithdrawLimit: 10000000, withdrawalsPerDay: 9, perWithdrawMax: 10000000, minWithdraw: 1000 },
  { level: 9, name: "Crown", minDeposit: 300000, nextLevelBonus: 4000, dailyWithdrawLimit: 0, withdrawalsPerDay: 10, perWithdrawMax: 0, minWithdraw: 1000 },
  { level: 10, name: "Elite", minDeposit: 500000, nextLevelBonus: 7500, dailyWithdrawLimit: 0, withdrawalsPerDay: 0, perWithdrawMax: 0, minWithdraw: 1000 },
  { level: 11, name: "King", minDeposit: 700000, nextLevelBonus: 10000, dailyWithdrawLimit: 0, withdrawalsPerDay: 0, perWithdrawMax: 0, minWithdraw: 1000 },
  { level: 12, name: "Imperial", minDeposit: 1000000, nextLevelBonus: 25000, dailyWithdrawLimit: 0, withdrawalsPerDay: 0, perWithdrawMax: 0, minWithdraw: 1000 },
  { level: 13, name: "Supreme", minDeposit: 2000000, nextLevelBonus: 50000, dailyWithdrawLimit: 0, withdrawalsPerDay: 0, perWithdrawMax: 0, minWithdraw: 1000 },
  { level: 14, name: "Royal Legend", minDeposit: 5000000, nextLevelBonus: 100000, dailyWithdrawLimit: 0, withdrawalsPerDay: 0, perWithdrawMax: 0, minWithdraw: 1000 },
  { level: 15, name: "Legend", minDeposit: 10000000, nextLevelBonus: 250000, dailyWithdrawLimit: 0, withdrawalsPerDay: 0, perWithdrawMax: 0, minWithdraw: 1000 },
];

const LEGACY_DEFAULT_VIP = [
  { level: 0, name: "Bronze", minDeposit: 0, dailyWithdrawLimit: 5000, perWithdrawMax: 5000, minWithdraw: 1000 },
  { level: 1, name: "Silver", minDeposit: 300, dailyWithdrawLimit: 15000, perWithdrawMax: 10000, minWithdraw: 1000 },
  { level: 2, name: "Gold", minDeposit: 1000, dailyWithdrawLimit: 30000, perWithdrawMax: 20000, minWithdraw: 1000 },
  { level: 3, name: "Platinum", minDeposit: 5000, dailyWithdrawLimit: 60000, perWithdrawMax: 40000, minWithdraw: 1000 },
  { level: 4, name: "Diamond", minDeposit: 20000, dailyWithdrawLimit: 150000, perWithdrawMax: 100000, minWithdraw: 1000 },
  { level: 5, name: "Royal", minDeposit: 50000, dailyWithdrawLimit: 300000, perWithdrawMax: 200000, minWithdraw: 1000 },
  { level: 6, name: "Legend", minDeposit: 150000, dailyWithdrawLimit: 1000000, perWithdrawMax: 500000, minWithdraw: 1000 },
];

export const DEFAULT_LEADERBOARD = [
  { name: "Jo...947", amount: 96239 },
  { name: "ub...264", amount: 84787 },
  { name: "Cr...026", amount: 82139 },
];

export type VipLevel = (typeof DEFAULT_VIP)[number];

let cachedSettings: { data: SettingsDoc; expires: number } | null = null;

export function invalidateSettingsCache() {
  cachedSettings = null;
}

export async function getSettings(forceRefresh = false): Promise<SettingsDoc> {
  if (!forceRefresh && cachedSettings && Date.now() < cachedSettings.expires) {
    return cachedSettings.data;
  }
  await dbConnect();
  let s = await Settings.findOne({ key: "main" }).lean<SettingsDoc>();
  if (!s) {
    s = (await Settings.create({ key: "main", vipLevels: DEFAULT_VIP, leaderboard: DEFAULT_LEADERBOARD })).toObject() as SettingsDoc;
  } else if (!s.vipLevels || s.vipLevels.length === 0) {
    await Settings.updateOne({ key: "main" }, { $set: { vipLevels: DEFAULT_VIP } });
    s = { ...s, vipLevels: DEFAULT_VIP as SettingsDoc["vipLevels"] };
  } else if (s.vipLevels.length === LEGACY_DEFAULT_VIP.length && s.vipLevels.every((level, index) => {
    const legacy = LEGACY_DEFAULT_VIP[index];
    return level.level === legacy.level && level.name === legacy.name && level.minDeposit === legacy.minDeposit && level.dailyWithdrawLimit === legacy.dailyWithdrawLimit && level.perWithdrawMax === legacy.perWithdrawMax && level.minWithdraw === legacy.minWithdraw;
  })) {
    await Settings.updateOne({ key: "main" }, { $set: { vipLevels: DEFAULT_VIP } });
    const users = await User.find({ role: { $nin: ["owner", "admin", "subadmin"] } }, "_id totalDeposited").lean();
    await Promise.all(users.map((user) => User.updateOne({ _id: user._id }, { $set: { vipLevel: vipFor(user.totalDeposited ?? 0, DEFAULT_VIP) } })));
    s = { ...s, vipLevels: DEFAULT_VIP as SettingsDoc["vipLevels"] };
  }
  if (!Array.isArray((s as SettingsDoc & { leaderboard?: SettingsDoc["leaderboard"] }).leaderboard)) {
    await Settings.updateOne({ key: "main" }, { $set: { leaderboard: DEFAULT_LEADERBOARD } });
    s = { ...s, leaderboard: DEFAULT_LEADERBOARD };
  }
  const referral = { ...(s.referral ?? {}) };
  if (referral.depositCommissionPct !== 1.5 || referral.referralDepositBonus !== 0 || referral.betCommissionPct !== 0 || referral.agentDepositCommissionPct !== 0) {
    referral.depositCommissionPct = 1.5;
    referral.referralDepositBonus = 0;
    referral.betCommissionPct = 0;
    referral.agentDepositCommissionPct = 0;
    await Settings.updateOne({ key: "main" }, { $set: { referral } });
    s = { ...s, referral: { ...s.referral, ...referral } as SettingsDoc["referral"] };
  }
  cachedSettings = { data: s, expires: Date.now() + 15000 };
  return s;
}

export function vipFor(totalDeposited: number, levels: { level?: number | null; minDeposit?: number | null }[]) {
  let lvl = 0;
  for (const l of levels) if ((l.minDeposit ?? 0) <= totalDeposited && (l.level ?? 0) > lvl) lvl = l.level ?? 0;
  return lvl;
}

export function vipInfo(level: number, levels: SettingsDoc["vipLevels"]) {
  const sorted = [...levels].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const cur = sorted.find((l) => l.level === level) ?? sorted[0];
  const next = sorted.find((l) => (l.level ?? 0) > level) ?? null;
  return { cur, next, all: sorted };
}

/** Recalculate a user's VIP level from approved deposits. */
export async function recomputeVip(userId: ObjectId) {
  const s = await getSettings();
  const [agg] = await Transaction.aggregate<{ dep: number; wd: number }>([
    { $match: { userId, status: "approved" } },
    { $group: { _id: null, dep: { $sum: { $cond: [{ $eq: ["$type", "deposit"] }, "$amount", 0] } }, wd: { $sum: { $cond: [{ $eq: ["$type", "withdraw"] }, "$amount", 0] } } } },
  ]);
  const dep = agg?.dep ?? 0, wd = agg?.wd ?? 0;
  const level = vipFor(dep, s.vipLevels);
  await User.updateOneAtomic({ _id: userId }, { $set: { totalDeposited: dep, totalWithdrawn: wd, vipLevel: level } });
  return { dep, wd, level };
}

/** Today's approved+pending withdrawals for a user (PKT day). */
export async function withdrawnToday(userId: ObjectId) {
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 3600 * 1000);
  const start = new Date(Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) - 5 * 3600 * 1000);
  const [agg] = await Transaction.aggregate<{ s: number }>([
    { $match: { userId, type: "withdraw", status: { $in: ["approved", "pending"] }, createdAt: { $gte: start } } },
    { $group: { _id: null, s: { $sum: "$amount" } } },
  ]);
  return agg?.s ?? 0;
}

/** Number of approved or pending withdrawals for the current PKT day. */
export async function withdrawalCountToday(userId: ObjectId) {
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 3600 * 1000);
  const start = new Date(Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) - 5 * 3600 * 1000);
  return Transaction.countDocuments({ userId, type: "withdraw", status: { $in: ["approved", "pending"] }, createdAt: { $gte: start } });
}

/** Hold new referral / agent commission until the player claims it. */
export async function payDepositCommission(depositorId: ObjectId, amount: number, actorRole?: string) {
  const dep = await User.findById(depositorId, "referredBy name").lean();
  if (!dep?.referredBy) return;
  const ref = await User.findById(dep.referredBy, "isActive").lean();
  if (!ref || !ref.isActive) return;
  const approvedDeposits = await Transaction.countDocuments({ userId: depositorId, type: "deposit", status: "approved" });
  if (approvedDeposits !== 1) return;
  const pct = 1.5;
  if (pct <= 0) return;
  const c = Math.round(amount * pct) / 100;
  if (c <= 0) return;
  const unlockAt = nextPakistanMidnight(Date.now()).getTime();
  await User.updateOneAtomic({ _id: ref._id }, { $inc: {
    pendingReferralCommission: c, commissionEarned: c, [`pendingReferralCommissionByUnlock.${unlockAt}`]: c,
  } });
  await Commission.create({ beneficiaryId: ref._id, fromUserId: depositorId, kind: "deposit", baseAmount: amount, pct, amount: c, note: `First deposit commission from ${dep.name}` });
  await notifyUser(String(ref._id), "Referral commission received", `Your 1.5% referral commission of Rs. ${c.toLocaleString("en-PK")} for ${dep.name}'s first approved deposit is visible on the withdrawal page. Claim it any time after the next 12 AM Pakistan time. It will enter your balance after you tap Claim.`, "success", { href: "/player/withdraw#referral-commission", actorRole });
}

export function genReferralCode(name: string) {
  const base = name.replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase() || "WINKOX";
  return base + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function genUsername(name: string, phone: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "player";
  return `${base}${phone.slice(-4)}`;
}

/** Support hours check (Pakistan time). */
export function supportOnline(sup: SettingsDoc["support"], now = new Date()) {
  if (!sup?.enabled) return false;
  if (sup.is247) return true;
  const h = (now.getUTCHours() + 5) % 24;
  const start = sup.startHour ?? 9, end = sup.endHour ?? 23;
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

export const DEFAULT_HELP = [
  {
    title: "Deposit kaise karein?", category: "Deposit", order: 1,
    steps: [
      { text: "Login karein aur neeche 'Deposit' par tap karein (ya Wallet page kholen).", image: "" },
      { text: "Payment method select karein — JazzCash ya Easypaisa — aur amount enter karein (minimum Rs. 100).", image: "" },
      { text: "Next par QR code wala page khulega. Apni JazzCash/Easypaisa app se QR scan karke payment karein.", image: "" },
      { text: "Payment ke baad usi page par 'Upload Screenshot' se payment ka screenshot upload karke submit karein.", image: "" },
      { text: "Admin verify karke approve karta hai to balance aapke wallet mein add ho jata hai. Status 'My Records' mein dekhein.", image: "" },
    ],
  },
  {
    title: "Withdraw kaise karein?", category: "Withdraw", order: 2,
    steps: [
      { text: "Wallet page par 'Withdraw' section kholen.", image: "" },
      { text: "Provider (JazzCash/Easypaisa), apna account number aur amount likhein (minimum Rs. 500). Apni VIP level ki daily limit dekh lein.", image: "" },
      { text: "Apna 4-digit Withdrawal PIN enter karein (pehli baar Profile se set karein).", image: "" },
      { text: "Request submit karein — admin review ke baad amount agle din raat 12:00 AM tak aapke account mein aa jayegi.", image: "" },
    ],
  },
  {
    title: "VIP level kaise barhayein?", category: "Account", order: 3,
    steps: [
      { text: "Aapki total approved deposits ke hisaab se VIP level automatic barhta hai (Silver 300, Gold 1,000, Platinum 5,000 ...).", image: "" },
      { text: "Zyada VIP level = zyada daily withdrawal limit. Profile page par apni level aur agli level ka target dekhein.", image: "" },
    ],
  },
  {
    title: "Invite karke commission kaise kamayein?", category: "Account", order: 4,
    steps: [
      { text: "Profile page par apna referral link copy karein aur doston ko bhejein.", image: "" },
      { text: "Jab aapka dost deposit karega to aapko deposit commission milega, aur uski har bet par bet commission bhi.", image: "" },
      { text: "Commission seedha aapke wallet balance mein add hota hai — 'My Team' section mein details dekhein.", image: "" },
    ],
  },
];

let helpSeeding: Promise<void> | null = null;
export async function ensureHelp() {
  helpSeeding ??= (async () => {
    await dbConnect();
    if ((await HelpArticle.countDocuments()) === 0) await HelpArticle.insertMany(DEFAULT_HELP);
  })().finally(() => { helpSeeding = null; });
  return helpSeeding;
}

const oid = (id: string): ObjectId => (String(id).startsWith("oid-") ? (String(id) as unknown as ObjectId) : (id as unknown as ObjectId));

export async function assignPaymentAccounts(userId: string): Promise<Record<string, string>> {
  await dbConnect();
  await ensurePaymentAccounts();
  return assignAccounts(String(userId));
}
