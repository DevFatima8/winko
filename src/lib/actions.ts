"use server";

import { revalidatePath } from "next/cache";
import { AdminLog, AviatorRound, CardBet, CardRound, ChickenDash, ChickenGame, Commission, Feedback, Game, GameResult, GatewaySession, HelpArticle, LoginEvent, MinesGame, Notification, PaymentAccount, PlinkoBet, Settings, SupportMessage, SupportThread, Transaction, User, oid } from "@/models";
import { hashPassword, verifyPassword, isStaff, staffLevel, type CurrentUser } from "./auth";
import { getServerSessionUser } from "./serverAuth";
import { assignPaymentAccounts } from "./platform";
import { genReferralCode, genUsername, getSettings, payDepositCommission, recomputeVip, vipInfo, withdrawnToday } from "./platform";
import { notifyAdmins, notifyUser } from "./notifications";
import { CLOUDINARY_URL_RE } from "./cloudinary";
import { requireProviderGame, saveProviderGame } from "./gregmornCatalog";

export type ActionState = { error?: string; success?: string } | undefined;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k));

// ---------- CLIENT: profile ----------
export async function setWithdrawPinAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getServerSessionUser();
  if (!me) return { error: "Login required." };
  const pin = str(form, "pin"), confirm = str(form, "confirm");
  const current = str(form, "current");
  if (!/^\d{4}$/.test(pin)) return { error: "PIN 4 digits ka hona chahiye." };
  if (pin !== confirm) return { error: "PIN match nahi karta." };
  const u = await User.findById(me.id, "withdrawPin");
  if (u?.withdrawPin && u.withdrawPin !== current) return { error: "Purana PIN ghalat hai." };
  await User.updateOne({ _id: oid(me.id) }, { $set: { withdrawPin: pin } });
  revalidatePath("/player/profile");
  return { success: "Withdrawal PIN set ho gaya." };
}

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getServerSessionUser();
  if (!me) return { error: "Login required." };
  const current = String(form.get("current") ?? ""), next = String(form.get("next") ?? "");
  const u = await User.findById(me.id);
  if (!u || !(await verifyPassword(current, u.passwordHash))) return { error: "Current password ghalat hai." };
  if (next.length < 6) return { error: "Naya password kam az kam 6 characters ka ho." };
  u.passwordHash = await hashPassword(next); u.passwordPlain = next;
  await u.save();
  return { success: "Password change ho gaya." };
}

// ---------- CLIENT WALLET ----------
export async function claimWinHoldsAction(_: ActionState, _form: FormData): Promise<ActionState> {
  const me = await getServerSessionUser();
  if (!me) return { error: "Login required." };
  const { claimWinHolds } = await import("./winHold");
  const { claimed } = await claimWinHolds(me.id);
  if (claimed <= 0) return { error: "Abhi koi claimable amount nahi hai." };
  revalidatePath("/player/wallet");
  return { success: `Rs. ${claimed.toLocaleString()} wallet mein claim ho gaya.` };
}

// ---------- SUPPORT (user side, server actions) ----------
export async function markNotificationsReadAction() {
  const me = await getServerSessionUser();
  if (!me) return;
  await Notification.updateMany({ isActive: true, readBy: { $ne: oid(me.id) } }, { $addToSet: { readBy: oid(me.id) } });
  revalidatePath("/player/notifications");
}

// ---------- ADMIN ----------
/** Any staff (sub admin, super admin, owner) */
async function requireAdmin(minLevel = 1) {
  const me = await getServerSessionUser();
  if (!me || me.role !== "admin" || me.level < minLevel) throw new Error("Unauthorized");
  return me;
}
/** Super admin or owner */
const requireSuper = () => requireAdmin(2);

async function canManagePlayer(me: CurrentUser, id: string) {
  const user = await User.findById(id, "role referredBy").lean();
  return !!user && !isStaff(user.role) && (me.level >= 2 || String(user.referredBy ?? "") === me.id);
}

async function logAdmin(me: Pick<CurrentUser, "id" | "name" | "dbRole">, action: string, target = "", details = "") {
  try {
    await AdminLog.create({ actorId: oid(me.id), actorName: me.name, actorRole: me.dbRole, action, target, details });
  } catch { }
}

const nextAdminId = async () => {
  const all = await User.find({ adminId: /^WX-ADM-/ }, "adminId").lean();
  let n = Math.max(1, ...all.map((u) => parseInt(String(u.adminId).replace("WX-ADM-", ""), 10) || 0)) + 1;
  while (await User.exists({ adminId: `WX-ADM-${String(n).padStart(4, "0")}` })) n++;
  return `WX-ADM-${String(n).padStart(4, "0")}`;
};

// ---------- STAFF MANAGEMENT (super admin / owner) ----------
export async function createSubAdminAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSuper();
  const name = str(form, "name"), phone = str(form, "phone").replace(/\s|-/g, ""), password = String(form.get("password") ?? "");
  const roleRaw = str(form, "role");
  if (roleRaw !== "subadmin" && roleRaw !== "admin") return { error: "Valid staff role select karein." };
  if (roleRaw === "admin" && me.level < 3) return { error: "Super Admin sirf Sub Admin create kar sakta hai. Super Admin account sirf Agent bana sakta hai." };
  const role = roleRaw;
  if (!name || !password) return { error: "Name aur password zaroori hain." };
  if (password.length < 6) return { error: "Password kam az kam 6 characters ka ho." };
  if (phone && !/^03\d{9}$/.test(phone)) return { error: "Phone 03XXXXXXXXX format mein ho (ya khali chhorein)." };
  const adminId = await nextAdminId();
  const finalPhone = phone || `ADM${Date.now().toString().slice(-8)}`;
  if (await User.exists({ phone: finalPhone })) return { error: "Ye phone number pehle se registered hai." };
  let referralCode = genReferralCode(name);
  while (await User.exists({ referralCode })) referralCode = genReferralCode(name);
  try {
    await User.create({ name, phone: finalPhone, username: adminId.toLowerCase(), passwordHash: await hashPassword(password), passwordPlain: password, role, adminId, createdBy: oid(me.id), referralCode, isActive: true });
  } catch (e) {
    return { error: `Database mein save nahi ho saka (${e instanceof Error ? e.message : "unknown"}). Dobara koshish karein.` };
  }
  await logAdmin(me, "create_staff", adminId, `${role} ${name}`);
  revalidatePath("/admin/staff");
  return { success: `${role === "admin" ? "Admin" : "Sub-admin"} ban gaya. Login ID: ${adminId} · Password: ${password}` };
}

export async function updateStaffAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSuper();
  const id = str(form, "id");
  const target = await User.findById(id);
  if (!target || !isStaff(target.role)) return { error: "Staff nahi mila." };
  if (staffLevel(target.role) >= me.level && String(target._id) !== me.id) return { error: "Aap is account ko modify nahi kar sakte." };
  const name = str(form, "name"), password = String(form.get("password") ?? ""), note = str(form, "note");
  if (name) target.name = name;
  if (password) { if (password.length < 6) return { error: "Password kam az kam 6 characters." }; target.passwordHash = await hashPassword(password); target.passwordPlain = password; }
  target.adminNote = note;
  await target.save();
  await logAdmin(me, "update_staff", target.adminId ?? String(target._id), password ? "password changed" : "profile updated");
  revalidatePath("/admin/staff");
  return { success: "Staff account update ho gaya." };
}

export async function toggleStaffAction(id: string, isActive: boolean) {
  const me = await requireSuper();
  const target = await User.findById(id, "role adminId").lean();
  if (!target || !isStaff(target.role) || staffLevel(target.role) >= me.level) return;
  await User.updateOne({ _id: oid(id) }, { $set: { isActive } });
  await logAdmin(me, isActive ? "unblock_staff" : "block_staff", target.adminId ?? id);
  revalidatePath("/admin/staff");
}

export async function deleteStaffAction(id: string) {
  const me = await requireSuper();
  const target = await User.findById(id, "role adminId").lean();
  if (!target || !isStaff(target.role) || staffLevel(target.role) >= me.level) return;
  await User.deleteOne({ _id: oid(id) });
  await logAdmin(me, "delete_staff", target.adminId ?? id);
  revalidatePath("/admin/staff");
}

/** Any staff can change their own password */
export async function changeOwnPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(1);
  const current = String(form.get("current") ?? ""), next = String(form.get("next") ?? "");
  const u = await User.findById(me.id);
  if (!u || !(await verifyPassword(current, u.passwordHash))) return { error: "Current password ghalat hai." };
  if (next.length < 6) return { error: "Naya password kam az kam 6 characters ka ho." };
  u.passwordHash = await hashPassword(next); u.passwordPlain = u.role === "owner" ? null : next;
  await u.save();
  await logAdmin(me, "change_own_password");
  return { success: "Password change ho gaya." };
}

export async function addPaymentAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(1);
  const provider = str(form, "provider");
  const accountTitle = str(form, "accountTitle");
  const accountNumber = str(form, "accountNumber").replace(/\s|-/g, "");
  if (provider !== "jazzcash" && provider !== "easypaisa" && provider !== "raast") return { error: "Provider select karein." };
  if (!accountTitle || !accountNumber) return { error: "Account holder name aur number zaroori hain." };
  // sub-admin accounts belong to them; super-admin accounts go into the shared pool (ownerId null)
  const ownerId = me.level >= 2 ? null : me.id;
  const qrImage = str(form, "qrImage");
  if (qrImage && !CLOUDINARY_URL_RE.test(qrImage) && (!/^data:image\/(png|jpe?g|webp);base64,/i.test(qrImage) || qrImage.length > 900_000)) return { error: "QR image invalid ya bohat bari hai." };
  await PaymentAccount.create({ provider, accountTitle, accountNumber, accountHolderName: accountTitle, ownerId, qrImage: qrImage || null });
  await logAdmin(me, "payment_account_create", accountNumber, provider);
  revalidatePath("/admin/payments");
  return { success: "Account add ho gaya." };
}
export async function togglePaymentAccountAction(id: string, isActive: boolean) {
  const me = await requireAdmin(1);
  const acc = await PaymentAccount.findById(oid(id));
  if (!acc) return { error: "Account nahi mila." };
  if (me.level < 2 && String(acc.ownerId ?? "") !== me.id) return { error: "Sirf apna account manage kar saktay hain." };
  await PaymentAccount.updateOne({ _id: oid(id) }, { $set: { isActive } });
  revalidatePath("/admin/payments");
}
export async function deletePaymentAccountAction(id: string) {
  const me = await requireAdmin(1);
  const acc = await PaymentAccount.findById(oid(id));
  if (!acc) return { error: "Account nahi mila." };
  if (me.level < 2 && String(acc.ownerId ?? "") !== me.id) return { error: "Sirf apna account delete kar saktay hain." };
  await Transaction.updateMany({ paymentAccountId: oid(id) }, { $set: { paymentAccountId: null } });
  await PaymentAccount.deleteOne({ _id: oid(id) });
  revalidatePath("/admin/payments");
}

// users
export async function toggleUserActiveAction(id: string, isActive: boolean, form?: FormData): Promise<ActionState & { isActive?: boolean }> {
  const me = await requireAdmin(1);
  const reason = str(form ?? new FormData(), "reason");
  const t = await User.findById(id, "role phone adminNote referredBy").lean();
  if (!t || isStaff(t.role) || (me.level < 2 && String(t.referredBy ?? "") !== me.id)) return { error: "User nahi mila ya aap is account ko manage nahi kar saktay." };
  const update = isActive ? { isActive: true } : { isActive: false, adminNote: reason || "Account blocked by administrator." };
  await User.updateOne({ _id: oid(id) }, { $set: update });
  const saved = await User.findById(id, "isActive").lean();
  if (!saved || saved.isActive !== isActive) return { error: "Account status save nahi ho saka. Dobara try karein." };
  if (isActive) {
    await notifyUser(id, "Account unblocked", "Your account has been unblocked. You can use the website again.", "success", { href: "/player/profile" });
  } else {
    await notifyUser(id, "Account blocked", `Your account has been blocked. Reason: ${reason || "Account blocked by administrator."} Contact Support if you believe this is incorrect.`, "warning", { href: "/player/profile" });
  }
  await logAdmin(me, isActive ? "unblock_user" : "block_user", t.phone, reason || t.adminNote || "No reason provided");
  revalidatePath("/admin/users"); revalidatePath(`/admin/users/${id}`);
  return { success: isActive ? "Account unblock ho gaya." : "Account block ho gaya.", isActive };
}
export async function deleteUserAction(id: string) {
  await requireAdmin(3);
  void id;
  throw new Error("Use the Agent player-deletion form with password and confirmation.");
}

export async function resetPlayerHistoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(3);
  const userId = str(form, "userId") || undefined;
  const mode = str(form, "mode");
  if (mode !== "reset" && mode !== "delete") return { error: "Choose a valid reset action." };
  if (mode === "delete" && !userId) return { error: "Choose one player to delete." };
  const phrase = mode === "delete" ? "DELETE PLAYER" : userId ? "RESET PLAYER" : "RESET ALL PLAYERS";
  if (str(form, "confirmation") !== phrase) return { error: `Type ${phrase} to confirm.` };
  const account = await User.findById(me.id, "passwordHash role").lean();
  if (!account || account.role !== "owner" || !await verifyPassword(String(form.get("password") ?? ""), account.passwordHash)) return { error: "Agent password is incorrect." };
  try {
    const { resetPlayerData } = await import("./playerDataReset");
    const result = await resetPlayerData({ userId, deleteAccount: mode === "delete", actorId: me.id, actorName: me.name });
    revalidatePath("/admin", "layout");
    revalidatePath("/player", "layout");
    revalidatePath("/");
    return { success: `${result.players} player(s) processed; ${result.deleted} records deleted.${mode === "delete" ? " Player account deleted." : " Balances and totals reset. Accounts remain blocked."}` };
  } catch (error) {
    console.error("[Agent player data reset]", error);
    return { error: error instanceof Error ? error.message : "Reset failed. Please check the server logs." };
  }
}

export async function deleteSelectedHistoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(3);
  if (str(form, "confirmation") !== "DELETE SELECTED HISTORY") return { error: "Type DELETE SELECTED HISTORY to confirm." };
  const account = await User.findById(me.id, "passwordHash role").lean();
  if (!account || account.role !== "owner" || !await verifyPassword(String(form.get("password") ?? ""), account.passwordHash)) return { error: "Agent password is incorrect." };
  try {
    const { parseHistorySelection } = await import("./historySelection");
    const { deleteSelectedHistory } = await import("./selectedHistoryCleanup");
    const selection = parseHistorySelection(form);
    const result = await deleteSelectedHistory({ userId: str(form, "userId") || undefined, selection, actorId: me.id, actorName: me.name });
    revalidatePath("/admin", "layout");
    revalidatePath("/player", "layout");
    revalidatePath("/");
    return { success: `${result.deleted} selected history record(s) deleted. Wallet balances, totals, accounts and active/pending operations are unchanged.` };
  } catch (error) {
    console.error("[Agent selected history cleanup]", error);
    return { error: error instanceof Error ? error.message : "History deletion failed. Please retry." };
  }
}
export async function adjustUserBalanceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(1);
  const id = str(form, "id");
  const amount = num(form, "amount");
  const direction = str(form, "direction");
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount 0 se zyada hona chahiye." };
  if (direction !== "add" && direction !== "remove") return { error: "Balance action select karein." };
  const u = await User.findById(id);
  if (!u || isStaff(u.role) || (me.level < 2 && String(u.referredBy ?? "") !== me.id)) return { error: "User nahi mila ya aapki team mein nahi hai." };
  if (direction === "remove" && (u.balance ?? 0) < amount) return { error: "User balance se zyada amount remove nahi kar sakte." };
  const change = direction === "add" ? amount : -amount;
  u.balance = (u.balance ?? 0) + change;
  await u.save();
  const label = direction === "add" ? "Balance added" : "Balance removed";
  await notifyUser(id, label, `Super Admin ne aapke wallet mein Rs. ${amount.toLocaleString()} ${direction === "add" ? "add" : "remove"} kiye. New balance: Rs. ${u.balance.toLocaleString()}.`, direction === "add" ? "success" : "warning", { href: "/player/wallet" });
  await logAdmin(me, direction === "add" ? "add_user_balance" : "remove_user_balance", u.phone, `Rs. ${amount.toLocaleString()} | new balance Rs. ${u.balance.toLocaleString()}`);
  revalidatePath("/admin/users"); revalidatePath(`/admin/users/${id}`);
  return { success: `Rs. ${amount.toLocaleString()} ${direction === "add" ? "add" : "remove"} ho gaye. New balance: Rs. ${u.balance.toLocaleString()}.` };
}
export async function adminUpdateUserAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(1);
  const id = str(form, "id");
  const u = await User.findById(id);
  if (!u || isStaff(u.role) || (me.level < 2 && String(u.referredBy ?? "") !== me.id)) return { error: "User nahi mila ya aapki team mein nahi hai." };
  const name = str(form, "name"), username = str(form, "username").toLowerCase(), email = str(form, "email");
  const password = String(form.get("password") ?? ""), pin = str(form, "pin");
  const role = str(form, "role");
  const paymentDepositLimit = num(form, "paymentDepositLimit");
  if (name) u.name = name;
  if (username && username !== u.username) { if (await User.exists({ username, _id: { $ne: u._id } })) return { error: "Username already taken." }; u.username = username; }
  u.email = email || null;
  if (password) { if (password.length < 6) return { error: "Password kam az kam 6 characters." }; u.passwordHash = await hashPassword(password); u.passwordPlain = password; }
  if (pin) { if (!/^\d{4}$/.test(pin)) return { error: "PIN 4 digits ka ho." }; u.withdrawPin = pin; }
  if (role === "client") u.role = role;
  if (!Number.isFinite(paymentDepositLimit) || paymentDepositLimit < 0) return { error: "Payment limit 0 ya positive amount hona chahiye." };
  u.paymentDepositLimit = paymentDepositLimit;
  await u.save();
  await logAdmin(me, "update_user", u.phone, [password ? "password" : "", pin ? "pin" : "", `role ${u.role}`, `payment limit ${paymentDepositLimit || "off"}`].filter(Boolean).join(", "));
  revalidatePath("/admin/users"); revalidatePath(`/admin/users/${id}`);
  return { success: "User update ho gaya." };
}
export async function setUserPaymentLimitAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(1);
  const id = str(form, "id");
  const limit = num(form, "paymentDepositLimit");
  if (!Number.isFinite(limit) || limit < 0) return { error: "Payment limit 0 ya positive amount hona chahiye." };
  const u = await User.findById(id, "role phone referredBy").lean();
  if (!u || isStaff(u.role) || (me.level < 2 && String(u.referredBy ?? "") !== me.id)) return { error: "User nahi mila ya aapki team mein nahi hai." };
  await User.updateOne({ _id: oid(id) }, { $set: { paymentDepositLimit: limit } });
  await logAdmin(me, "set_payment_limit", u.phone, limit > 0 ? `Rs. ${limit}` : "unlocked");
  revalidatePath("/admin/users"); revalidatePath(`/admin/users/${id}`);
  return { success: limit > 0 ? `Payment lock Rs. ${limit.toLocaleString()} par set ho gaya.` : "Payment lock remove ho gaya." };
}
export async function setUserGameBlockAction(userId: string, slug: string, blocked: boolean) {
  const me = await requireAdmin(1);
  if (!await canManagePlayer(me, userId)) throw new Error("Player is not in your team.");
  const normalizedSlug = slug.trim().toLowerCase();
  await requireProviderGame(normalizedSlug);
  await User.updateOne({ _id: oid(userId) }, blocked ? { $addToSet: { blockedGames: normalizedSlug } } : { $pull: { blockedGames: normalizedSlug } });
  await logAdmin(me, blocked ? "restrict_user_game" : "unrestrict_user_game", userId, normalizedSlug);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath(`/admin/users/${userId}/game-restrictions`);
}

export async function adjustVipBetPointsAction(userId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(1);
  if (!await canManagePlayer(me, userId)) return { error: "Player nahi mila ya aapki team mein nahi hai." };
  const amount = Math.floor(num(form, "amount"));
  const direction = str(form, "direction");
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Points 0 se zyada hone chahiye." };
  if (direction !== "add" && direction !== "remove") return { error: "Add ya remove select karein." };
  const user = await User.findById(userId, "name phone role vipBetPoints").lean();
  if (!user || user.role !== "client") return { error: "Player nahi mila." };
  const current = user.vipBetPoints ?? 0;
  if (direction === "remove" && current < amount) return { error: "Player ke current points se zyada remove nahi kar sakte." };
  const result = await User.updateOne(
    direction === "remove" ? { _id: oid(userId), vipBetPoints: { $gte: amount } } : { _id: oid(userId) },
    { $inc: { vipBetPoints: direction === "add" ? amount : -amount } },
  );
  if (!result.modifiedCount) return { error: "Points update nahi huay; list refresh karke dobara try karein." };
  await logAdmin(me, direction === "add" ? "vip_bet_points_add" : "vip_bet_points_remove", user.phone, `${amount} points | ${current} → ${current + (direction === "add" ? amount : -amount)}`);
  revalidatePath("/admin/vip-bets"); revalidatePath(`/admin/users/${userId}`);
  return { success: `VIP bet points ${direction === "add" ? "add" : "remove"} ho gaye.` };
}

// games on/off
export async function toggleGameAction(slug: string, isActive: boolean) {
  await requireSuper();
  await saveProviderGame(await requireProviderGame(slug));
  await Game.updateMany({ slug: { $regex: new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } }, { $set: { isActive, ...(isActive ? {} : { isHot: false }) } });
  revalidatePath("/admin/games"); revalidatePath("/"); revalidatePath("/player");
}

export async function toggleGameHotAction(slug: string, isHot: boolean) {
  await requireSuper();
  await saveProviderGame(await requireProviderGame(slug));
  await Game.updateMany({ slug: { $regex: new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }, isActive: { $ne: false } }, { $set: { isHot } });
  revalidatePath("/admin/games"); revalidatePath("/"); revalidatePath("/games-all");
}

// settings
export async function saveVipLevelsAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSuper();
  const levels = [];
  for (let i = 0; i < 16; i++) {
    const name = str(form, `name_${i}`);
    if (!name) continue;
    const nextLevelBonus = num(form, `bonus_${i}`), withdrawalsPerDay = num(form, `count_${i}`);
    const minDeposit = num(form, `min_${i}`), dailyWithdrawLimit = num(form, `daily_${i}`), perWithdrawMax = num(form, `per_${i}`), minWithdraw = num(form, `minw_${i}`) || 500;
    if ([minDeposit, nextLevelBonus, dailyWithdrawLimit, withdrawalsPerDay, perWithdrawMax, minWithdraw].some((value) => !Number.isFinite(value) || value < 0)) return { error: "VIP values zero ya us se zyada honi chahiye." };
    levels.push({ level: i, name, minDeposit, nextLevelBonus, dailyWithdrawLimit, withdrawalsPerDay, perWithdrawMax, minWithdraw });
  }
  if (!levels.length) return { error: "Kam az kam ek level zaroori hai." };
  await Settings.updateOne({ key: "main" }, { $set: { vipLevels: levels } }, { upsert: true });
  // recompute everyone's level
  const users = await User.find({ role: { $nin: ["owner", "admin", "subadmin"] } }, "_id").lean();
  for (const u of users) await recomputeVip(u._id);
  revalidatePath("/admin/vip");
  return { success: "VIP levels save ho gayi aur sab users ki levels update ho gayin." };
}

export async function saveLeaderboardAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSuper();
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("entries") ?? "[]")); } catch { return { error: "Leaderboard data invalid hai." }; }
  if (!Array.isArray(raw) || raw.length !== 3) return { error: "Leaderboard mein exactly top 3 winners hone chahiye." };
  const entries: { name: string; amount: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item.name !== "string" || !item.name.trim()) return { error: "Top 3 winners ke naam required hain." };
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount < 0) return { error: "Winning amount zero ya us se zyada hona chahiye." };
    entries.push({ name: item.name.trim().slice(0, 50), amount: Math.floor(amount) });
  }
  await Settings.updateOne({ key: "main" }, { $set: { leaderboard: entries } }, { upsert: true });
  await logAdmin(me, "leaderboard_update", "home leaderboard", `${entries.length} winner(s) updated`);
  revalidatePath("/"); revalidatePath("/admin/leaderboard");
  return { success: "Leaderboard update ho gaya." };
}

export async function saveSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSuper();
  const whatsappChannel = str(form, "whatsappChannel");
  if (whatsappChannel) {
    try {
      const url = new URL(whatsappChannel);
      if (url.protocol !== "https:" || !/^(www\.)?whatsapp\.com$/.test(url.hostname) || !/^\/channel\/[^/]+/.test(url.pathname)) {
        return { error: "WhatsApp Channel ka valid https://whatsapp.com/channel/... link dein." };
      }
    } catch {
      return { error: "WhatsApp Channel ka valid https://whatsapp.com/channel/... link dein." };
    }
  }
  const set = {
    "support.enabled": form.get("support_enabled") === "on",
    "support.is247": form.get("support_247") === "on",
    "support.startHour": Math.min(23, Math.max(0, num(form, "support_start") || 0)),
    "support.endHour": Math.min(24, Math.max(0, num(form, "support_end") || 0)),
    "support.offlineMessage": str(form, "support_offline"),
    "support.welcomeMessage": str(form, "support_welcome"),
    "links.whatsapp": str(form, "whatsapp"), "links.whatsappChannel": whatsappChannel,
    "links.telegram": str(form, "telegram"), "links.telegramChannel": str(form, "telegramChannel"),
    "links.facebook": str(form, "facebook"), "links.instagram": str(form, "instagram"), "links.youtube": str(form, "youtube"),
    "app.androidUrl": str(form, "androidUrl"), "app.iosUrl": str(form, "iosUrl"), "app.version": str(form, "appVersion") || "1.0.0",
    "referral.depositCommissionPct": 1.5, "referral.betCommissionPct": 0,
    "referral.signupBonus": num(form, "signupBonus") || 0, "referral.referralDepositBonus": 0, "referral.agentDepositCommissionPct": 0,
    "wallet.minDeposit": num(form, "minDeposit") || 100, "wallet.minWithdraw": num(form, "minWithdraw") || 500,
    "fakeGateway.enabled": form.get("fg_enabled") === "on",
    "fakeGateway.autoWithdraw": form.get("fg_autoWithdraw") === "on",
    "fakeGateway.testOtp": (str(form, "fg_otp") || "1234").slice(0, 8),
    "fakeGateway.maxPerTxn": num(form, "fg_max") || 50000,
    "fakeGateway.dailyLimit": num(form, "fg_daily") || 200000,
    "fakeGateway.label": str(form, "fg_label") || "Instant Deposit (Test Mode)",
  };
  await Settings.updateOne({ key: "main" }, { $set: set }, { upsert: true });
  revalidatePath("/"); revalidatePath("/admin/settings");
  return { success: "Settings save ho gayi." };
}

// notifications
export async function sendNotificationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(1);
  const title = str(form, "title"), body = str(form, "body");
  const typeRaw = str(form, "type"), audRaw = str(form, "audience");
  const type = (["info", "promo", "warning", "success"].includes(typeRaw) ? typeRaw : "info") as "info" | "promo" | "warning" | "success";
  const audience = (["all", "clients", "agents", "user", "team"].includes(audRaw) ? audRaw : "all") as "all" | "clients" | "agents" | "user" | "team";
  const phone = str(form, "phone");
  if (!title || !body) return { error: "Title aur message zaroori hain." };
  if (me.level < 2 && audience !== "team" && audience !== "user") return { error: "Sub-admin sirf apni team ko notification bhej sakta hai." };
  if (audience === "team") {
    const members = await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean();
    if (!members.length) return { error: "Aapki team mein abhi koi player nahi hai." };
    await Promise.all(members.map((member) => Notification.create({ title, body, type, audience: "user", userId: member._id })));
    await logAdmin(me, "send_notification", "team", `${title} (${members.length} recipients)`);
    revalidatePath("/admin/notifications");
    return { success: `Notification aapki team ke ${members.length} member(s) ko bhej di gayi.` };
  }
  let userId = null;
  if (audience === "user") {
    const u = await User.findOne({
      phone,
      ...(me.level < 2 ? { referredBy: me.id, role: { $in: ["client", "agent"] } } : {}),
    }, "_id").lean();
    if (!u) return { error: "Is phone number ka user nahi mila." };
    userId = u._id;
  }
  await Notification.create({ title, body, type, audience, userId });
  await logAdmin(me, "send_notification", audience, title);
  revalidatePath("/admin/notifications");
  return { success: audience === "user" ? "Notification us user ko bhej di gayi." : "Notification sab users ko bhej di gayi." };
}
export async function deleteNotificationAction(id: string) {
  await requireSuper();
  await Notification.deleteOne({ _id: oid(id) });
  revalidatePath("/admin/notifications");
}

export async function cleanupHistoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin(3);
  if (str(form, "confirmation") !== "DELETE HISTORY") return { error: "Type DELETE HISTORY to confirm." };
  const account = await User.findById(me.id, "passwordHash role").lean();
  if (!account || account.role !== "owner" || !await verifyPassword(String(form.get("password") ?? ""), account.passwordHash)) return { error: "Agent password is incorrect." };
  const kind = str(form, "kind");
  const rawDays = Number(form.get("olderThanDays") ?? 0);
  if (!Number.isFinite(rawDays) || rawDays < 0 || !Number.isInteger(rawDays)) return { error: "Days must be a whole number, 0 or greater." };
  const olderThanDays = Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 0;
  const createdAt = olderThanDays ? { $lt: new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000) } : undefined;
  const filter = createdAt ? { createdAt } : {};
  let deleted = 0;
  if (kind === "transactions") deleted = (await Transaction.deleteMany(filter)).deletedCount;
  else if (kind === "game-results") {
    deleted += (await GameResult.deleteMany({ ...filter, poolPending: { $ne: true } })).deletedCount;
    deleted += (await PlinkoBet.deleteMany({ ...filter, poolPending: { $ne: true } })).deletedCount;
    deleted += (await MinesGame.deleteMany({ ...filter, poolPending: { $ne: true } })).deletedCount;
    deleted += (await ChickenGame.deleteMany({ ...filter, poolPending: { $ne: true } })).deletedCount;
    deleted += (await ChickenDash.deleteMany({ ...filter, poolPending: { $ne: true } })).deletedCount;
  } else if (kind === "aviator") deleted = (await AviatorRound.deleteMany({ ...filter, status: "crashed" })).deletedCount;
  else if (kind === "card-games") {
    deleted += (await CardBet.deleteMany({ ...filter, poolPending: { $ne: true } })).deletedCount;
    deleted += (await CardRound.deleteMany({ ...filter, status: "settled" })).deletedCount;
  } else if (kind === "notifications") deleted = (await Notification.deleteMany(filter)).deletedCount;
  else if (kind === "support") {
    const threads = await SupportThread.find(filter, "_id").lean();
    for (const thread of threads) deleted += (await SupportMessage.deleteMany({ threadId: thread._id })).deletedCount;
    deleted += (await SupportThread.deleteMany(filter)).deletedCount;
  } else if (kind === "gateway") deleted = (await GatewaySession.deleteMany(filter)).deletedCount;
  else if (kind === "commissions") deleted = (await Commission.deleteMany(filter)).deletedCount;
  else if (kind === "admin-logs") deleted = (await AdminLog.deleteMany(filter)).deletedCount;
  else return { error: "History category select karein." };
  await logAdmin(me, "cleanup_history", kind, `${deleted} record(s) deleted${olderThanDays ? ` older than ${olderThanDays} days` : ""}`);
  revalidatePath("/admin/cleanup"); revalidatePath("/admin/logs");
  return { success: `${deleted} history record(s) delete ho gaye.` };
}

// help center
export async function saveHelpArticleAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSuper();
  const id = str(form, "id");
  const title = str(form, "title"), category = str(form, "category") || "General", order = num(form, "order") || 0;
  if (!title) return { error: "Title zaroori hai." };
  const steps = [];
  for (let i = 0; i < 20; i++) {
    const text = str(form, `step_text_${i}`); const image = str(form, `step_image_${i}`);
    if (text || image) steps.push({ text, image });
  }
  if (id) await HelpArticle.updateOne({ _id: oid(id) }, { $set: { title, category, order, steps, isActive: form.get("isActive") === "on" } });
  else await HelpArticle.create({ title, category, order, steps, isActive: true });
  revalidatePath("/admin/help"); revalidatePath("/help");
  return { success: "Article save ho gaya." };
}
export async function deleteHelpArticleAction(id: string) {
  await requireSuper();
  await HelpArticle.deleteOne({ _id: oid(id) });
  revalidatePath("/admin/help"); revalidatePath("/help");
}

// support chat (admin reply)
export async function adminReplySupportAction(threadId: string, text: string) {
  const me = await requireAdmin(1);
  const t = text.trim();
  if (!t) throw new Error("Message khali hai.");
  const thread = await SupportThread.findById(threadId).lean();
  if (!thread) throw new Error("Support chat nahi mili.");
  if (me.level < 2) {
    if (thread.assignedTo && String(thread.assignedTo) !== me.id) throw new Error("Ye chat aapki team mein nahi hai.");
    if (thread.userId) {
      if (!await User.exists({ _id: thread.userId, referredBy: me.id, role: { $in: ["client", "agent"] } })) throw new Error("Ye chat aapki team mein nahi hai.");
    } else if (String(thread.assignedTo ?? "") !== me.id) {
      throw new Error("Ye chat aapki team mein nahi hai.");
    }
  }
  await SupportMessage.create({ threadId: oid(threadId), from: "agent", text: t, agentName: me.level >= 3 ? "Support Team" : me.name, agentId: oid(me.id) });
  await SupportThread.updateOne({ _id: oid(threadId) }, { $set: { lastMessage: t, lastMessageAt: new Date(), unreadForAdmin: 0, status: "open" }, $inc: { unreadForUser: 1 } });
  if (me.level < 3) await SupportThread.updateOne({ _id: oid(threadId), assignedTo: null }, { $set: { assignedTo: oid(me.id), assignedName: me.name } });
  revalidatePath(`/admin/support/${threadId}`); revalidatePath("/admin/support");
}
export async function closeSupportThreadAction(threadId: string, status: "open" | "closed") {
  const me = await requireAdmin(1);
  if (status !== "open" && status !== "closed") throw new Error("Invalid support status.");
  const thread = await SupportThread.findById(threadId).lean();
  if (!thread) throw new Error("Support chat nahi mili.");
  if (me.level < 2) {
    if (thread.assignedTo && String(thread.assignedTo) !== me.id) throw new Error("Ye chat aapki team mein nahi hai.");
    if (thread.userId) {
      if (!await User.exists({ _id: thread.userId, referredBy: me.id, role: { $in: ["client", "agent"] } })) throw new Error("Ye chat aapki team mein nahi hai.");
    } else if (String(thread.assignedTo ?? "") !== me.id) {
      throw new Error("Ye chat aapki team mein nahi hai.");
    }
  }
  await SupportThread.updateOne({ _id: oid(threadId) }, { $set: { status } });
  revalidatePath(`/admin/support/${threadId}`); revalidatePath("/admin/support");
}

export async function updateFeedbackAction(form: FormData) {
  const me = await requireAdmin(1);
  const id = str(form, "id"), status = str(form, "status"), note = str(form, "note");
  if (!["reviewed", "resolved", "new"].includes(status)) return;
  if (me.level < 2) {
    const teamIds = (await User.find({ referredBy: me.id, role: { $in: ["client", "agent"] } }, "_id").lean()).map((user) => user._id);
    if (!await Feedback.exists({ _id: oid(id), userId: { $in: teamIds } })) return;
  }
  await Feedback.updateOne({ _id: oid(id) }, { $set: { status: status as "new" | "reviewed" | "resolved", adminNote: note } });
  revalidatePath("/admin/feedback");
}
