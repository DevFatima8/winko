import { createHash } from "node:crypto";
import type { GameDoc, GameResultDoc, UserDoc } from "@/models";
import type { MultiplayerTransaction } from "./multiplayer-store";
import { gregmornGameSlug } from "./gregmornIdentity";
import { claimWinningsTransaction } from "./providerWinnings";

export type GregmornSession = {
  _id: string;
  sessionId: string;
  userId: string;
  playerLogin: string;
  gameId: string;
  currency: string;
  catalogGameId?: string;
  demo?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type GregmornWalletTransaction = {
  _id: string;
  sessionId: string;
  transactionId: string;
  requestHash: string;
  betCents: number;
  winCents: number;
  rolledBack: boolean;
  rollbackHash?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type GregmornCallbackBody = {
  cmd: "getBalance" | "writeBet" | "rollback";
  login: string;
  sessionid: string;
  transactionId?: string;
  bet?: number | string;
  win?: number | string;
  round_finished?: boolean;
  info?: string;
  gameId?: string;
};

export class GregmornWalletError extends Error {
  constructor(message: string, readonly balance?: number) {
    super(message);
  }
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sessionKey = (sessionId: string) => digest(sessionId);
const txKey = (sessionId: string, transactionId: string) => digest(`${sessionId}\u0000${transactionId}`);
const moneyCents = (value: unknown) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents / 100 === amount ? cents : null;
};
// Panel balances can carry float noise or sub-paisa remainders from other wallet flows;
// the provider only sees whole paisa, and the remainder stays on the player's balance.
const walletCents = (balance: number) => Math.floor(Number((balance * 100).toFixed(4)));
const withRemainder = (balance: number, fromCents: number, toCents: number) =>
  Number((toCents / 100 + Math.max(0, balance - fromCents / 100)).toFixed(6));

export async function registerGregmornSession(tx: MultiplayerTransaction, session: Omit<GregmornSession, "_id" | "createdAt" | "updatedAt">) {
  const id = sessionKey(session.sessionId);
  const existing = await tx.get<GregmornSession>("gregmornsessions", id, true);
  if (existing) {
    if (existing.userId !== session.userId || existing.playerLogin !== session.playerLogin ||
        existing.gameId !== session.gameId || existing.currency !== session.currency ||
        Boolean(existing.demo) !== Boolean(session.demo)) {
      throw new GregmornWalletError("Gregmorn returned a session identity already in use.");
    }
    return;
  }
  const now = new Date(await tx.now());
  await tx.insert("gregmornsessions", id, { ...session, _id: id, createdAt: now, updatedAt: now });
}

function requestHash(body: GregmornCallbackBody) {
  return digest(JSON.stringify({
    cmd: body.cmd, login: body.login, sessionid: body.sessionid,
    transactionId: body.transactionId ?? "", bet: body.bet ?? null, win: body.win ?? null,
    round_finished: body.round_finished ?? null, info: body.info ?? "", gameId: body.gameId ?? "",
  }));
}

async function playerWallet(tx: MultiplayerTransaction, userId: string) {
  const account = await tx.get<UserDoc>("users", userId, true);
  if (!account || account.role !== "client" || !account.isActive ||
      !Number.isFinite(account.balance) || account.balance < 0) {
    throw new GregmornWalletError("Player wallet is unavailable.");
  }
  await claimWinningsTransaction(tx, userId);
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user) throw new GregmornWalletError("Player wallet is unavailable.");
  const currentCents = walletCents(user.balance);
  if (!Number.isSafeInteger(currentCents)) throw new Error("Stored player balance is outside wallet limits.");
  return { user, currentCents };
}

export async function processGregmornWalletCallback(tx: MultiplayerTransaction, body: GregmornCallbackBody) {
  if (!body.login || body.login.length > 64 || !body.sessionid || body.sessionid.length > 255) {
    throw new GregmornWalletError("Unknown Gregmorn player session.");
  }
  const session = await tx.get<GregmornSession>("gregmornsessions", sessionKey(body.sessionid));
  // Signed getBalance can arrive inside openGame, before its session ID is returned.
  if (!session && body.cmd === "getBalance") {
    const demo = body.login.startsWith("demo.");
    const displayId = demo ? body.login.slice(5) : body.login;
    const accounts = await tx.findWhere<UserDoc>("users", { displayId, role: "client" }, 2);
    if (accounts.length !== 1 || !accounts[0].isActive) {
      throw new GregmornWalletError("Unknown or unavailable Gregmorn player.");
    }
    if (demo) return { balance: 0, currency: process.env.GREGMORN_CURRENCY ?? "PKR" };
    const { currentCents } = await playerWallet(tx, accounts[0]._id);
    return { balance: currentCents / 100, currency: process.env.GREGMORN_CURRENCY ?? "PKR" };
  }
  if (!session || session.sessionId !== body.sessionid || session.playerLogin !== body.login) {
    throw new GregmornWalletError("Unknown Gregmorn player session.");
  }
  if (session.demo) {
    if (body.cmd !== "getBalance") throw new GregmornWalletError("This is a view-only demo session.", 0);
    return { balance: 0, currency: session.currency };
  }
  const { user, currentCents } = await playerWallet(tx, session.userId);
  if (body.cmd === "getBalance") {
    return { balance: currentCents / 100, currency: session.currency };
  }
  if (!body.transactionId || body.transactionId.length > 255 || typeof body.info !== "string" ||
      typeof body.round_finished !== "boolean" ||
      body.gameId !== undefined && body.gameId !== session.gameId ||
      body.cmd === "rollback" && body.gameId !== session.gameId) {
    throw new GregmornWalletError("Invalid Gregmorn transaction.");
  }

  const key = txKey(body.sessionid, body.transactionId);
  const existing = await tx.get<GregmornWalletTransaction>("gregmorntransactions", key, true);

  if (body.cmd === "writeBet") {
    const betCents = moneyCents(body.bet);
    const winCents = moneyCents(body.win);
    if (betCents === null || winCents === null) throw new GregmornWalletError("Invalid bet or win amount.");
    const fingerprint = requestHash(body);
    if (existing) {
      if (existing.requestHash !== fingerprint || existing.rolledBack) {
        throw new GregmornWalletError("Gregmorn transaction identity was already used.", currentCents / 100);
      }
      return { balance: currentCents / 100, currency: session.currency };
    }
    if (betCents > 0) {
      const slug = gregmornGameSlug(session.gameId);
      const game = session.catalogGameId ? await tx.get<GameDoc>("games", session.catalogGameId) : null;
      if (game?.isActive === false || user.blockedGames?.includes(slug)) {
        throw new GregmornWalletError("This provider game is restricted.", currentCents / 100);
      }
    }
    if (currentCents < betCents) throw new GregmornWalletError("insufficient funds", currentCents / 100);
    const nextCents = currentCents - betCents + winCents;
    if (!Number.isSafeInteger(nextCents)) throw new GregmornWalletError("Transaction amount exceeds wallet limits.", currentCents / 100);
    user.balance = withRemainder(user.balance, currentCents, nextCents);
    await tx.put("users", session.userId, user);
    const now = new Date(await tx.now());
    await tx.insert("gregmorntransactions", key, {
      _id: key, sessionId: body.sessionid, transactionId: body.transactionId,
      requestHash: fingerprint, betCents, winCents, rolledBack: false, createdAt: now, updatedAt: now,
    });
    await tx.insert<GameResultDoc>("gameresults", key, {
      _id: key, gameId: session.catalogGameId ?? gregmornGameSlug(session.gameId), userId: session.userId,
      roundNo: null, betSlot: 0, betAmount: betCents / 100, winAmount: winCents / 100,
      outcome: winCents > 0 ? "win" : "lose",
      resultData: JSON.stringify({ provider: "gregmorn", transactionId: body.transactionId, roundFinished: body.round_finished }),
      createdAt: now, updatedAt: now,
    });
    return { balance: nextCents / 100, currency: session.currency };
  }

  const rollbackCents = moneyCents(body.bet);
  const winCents = moneyCents(body.win);
  if (rollbackCents === null || winCents !== 0 || !existing || existing.betCents !== rollbackCents) {
    throw new GregmornWalletError("Original Gregmorn bet was not found for rollback.", currentCents / 100);
  }
  const rollbackFingerprint = requestHash(body);
  if (existing.rolledBack) {
    if (existing.rollbackHash !== rollbackFingerprint) throw new GregmornWalletError("transaction already rolled back", currentCents / 100);
    return { balance: currentCents / 100, currency: session.currency };
  }
  const restoredCents = currentCents + rollbackCents;
  if (!Number.isSafeInteger(restoredCents)) throw new GregmornWalletError("Rollback amount exceeds wallet limits.", currentCents / 100);
  user.balance = withRemainder(user.balance, currentCents, restoredCents);
  await tx.put("users", session.userId, user);
  existing.rolledBack = true;
  existing.rollbackHash = rollbackFingerprint;
  existing.updatedAt = new Date(await tx.now());
  await tx.put("gregmorntransactions", key, existing);
  const result = await tx.get<GameResultDoc>("gameresults", key, true);
  if (result) {
    result.betAmount = 0;
    result.updatedAt = existing.updatedAt;
    result.resultData = JSON.stringify({ provider: "gregmorn", transactionId: body.transactionId, rolledBack: true });
    await tx.put("gameresults", key, result);
  }
  return { balance: restoredCents / 100, currency: session.currency };
}

export function gregmornCallbackRoom(sessionId: string) {
  return `gregmorn:callback:${sessionKey(sessionId).slice(0, 40)}`;
}
