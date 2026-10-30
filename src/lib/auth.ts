/**
 * Browser identity is resolved from the server's signed HttpOnly cookie.
 */
import type { UserDoc } from "@/models";
import { DEFAULT_BET_PRESETS } from "@/lib/betPresets";

export type Role = "admin" | "client";
export type DbRole = "owner" | "admin" | "subadmin" | "agent" | "client";
export const staffLevel = (r: DbRole | string | null | undefined) => (r === "owner" ? 3 : r === "admin" ? 2 : r === "subadmin" ? 1 : 0);
export const isStaff = (r: DbRole | string | null | undefined) => staffLevel(r) > 0;
export type SessionUser = { id: string; role: Role; name: string };

const isBrowser = () => typeof window !== "undefined";

export async function hashPassword(pw: string) { return "plain:" + pw; }
export async function verifyPassword(pw: string, hash: string) { return hash === "plain:" + pw || hash === pw; }

export function getSessionSync(): SessionUser | null {
  return null;
}
export async function getSession(): Promise<SessionUser | null> { return getSessionSync(); }
export async function createSession(user: SessionUser) {
  if (!isBrowser()) return;
  void user;
  window.dispatchEvent(new CustomEvent("wx:session"));
}
export async function destroySession() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent("wx:session"));
}

export type CurrentUser = {
  displayId: string | null;
  id: string; name: string; avatar: string | null; username: string | null; phone: string; email: string | null; role: Role; dbRole: DbRole; balance: number; isActive: boolean; vipPointsWelcomePending: boolean;
  level: number; adminId: string | null; vipLevel: number; totalDeposited: number; totalWithdrawn: number; vipBetPoints: number; blockedGames: string[]; referralCode: string | null; hasPin: boolean; commissionEarned: number; adminNote: string;
  betPresets: number[];
};
export function toCurrentUser(u: UserDoc): CurrentUser {
  const dbRole = (u.role as DbRole) ?? "client";
  return {
    displayId: null,
    id: String(u._id), name: u.name, avatar: u.avatar ?? null, username: u.username ?? null, phone: u.phone, email: u.email ?? null,
    role: isStaff(dbRole) ? "admin" : "client", dbRole, balance: u.balance ?? 0, isActive: u.isActive !== false, level: staffLevel(dbRole), adminId: u.adminId ?? null,
    vipLevel: u.vipLevel ?? 0, vipBetPoints: u.vipBetPoints ?? 0, vipPointsWelcomePending: u.vipPointsWelcomePending ?? false, totalDeposited: u.totalDeposited ?? 0, totalWithdrawn: u.totalWithdrawn ?? 0, blockedGames: u.blockedGames ?? [], referralCode: u.referralCode ?? null, hasPin: !!u.withdrawPin, commissionEarned: u.commissionEarned ?? 0, adminNote: u.adminNote ?? "", betPresets: u.betPresets ?? [...DEFAULT_BET_PRESETS],
  };
}
let _userPromise: Promise<CurrentUser | null> | null = null;
let _userPromiseTime = 0;
if (typeof window !== "undefined") {
  window.addEventListener("wx:session", () => { _userPromiseTime = 0; });
  window.addEventListener("wx:balance-update", () => { _userPromiseTime = 0; });
}

export function getConnectionErrorMessage(message?: string) {
  const text = (message ?? "").toLowerCase();
  if (/offline|internet|network|failed to fetch|timed out|timeout|fetch failed|connection/i.test(text)) {
    return "Internet connection issue. Please check your internet and try again.";
  }
  return "Server is temporarily unavailable. Please try again in a moment.";
}

export async function getCurrentUser(force = false): Promise<CurrentUser | null> {
  if (isBrowser()) {
    const now = Date.now();
    if (!force && _userPromise && (now - _userPromiseTime < 5000)) {
      return _userPromise;
    }
    _userPromiseTime = now;
    _userPromise = (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) throw new Error(getConnectionErrorMessage("network"));
        const data = await res.json();
        if (data.user === null) return null;
        if (!data.user || typeof data.user !== "object") {
          throw new Error(getConnectionErrorMessage("invalid-session"));
        }
        return data.user as CurrentUser;
      } catch (error) {
        _userPromise = null;
        _userPromiseTime = 0;
        throw error instanceof Error ? new Error(getConnectionErrorMessage(error.message)) : new Error(getConnectionErrorMessage());
      }
    })();
    return _userPromise;
  }
  return null;
}
export async function requireRole(role: Role) {
  const u = await getCurrentUser();
  if (!u || u.role !== role) return null;
  return u;
}
