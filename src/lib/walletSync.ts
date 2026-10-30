"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { dailyPoolConsent } from "./dailyPoolConsent";
import type { DailyPoolGame } from "./dailyPoolRules";
import { notifyGameResult } from "./gameResultNotice";
import { isCardGame } from "./cardGameRules";
import { isRouletteGame, isBrowserRouletteGame } from "./rouletteGameRules";
import { isAutoResolveBrowserCardGame, isInteractiveBrowserCardGame } from "./browserCardGames";
import { isSlotGame } from "./slotGameRules";

/** Explicit engine snapshots. Callers choose gameplay fields; wallets are never restored from these. */
export function usePoolRoundState<T>(game: DailyPoolGame, field: string, initial: T | (() => T), slot = "main") {
  const key = `wx:browser-active:${game}:${slot}`;
  const initialValue = useRef(initial);
  const [value, setValue] = useState<T>(() => {
    const fallback = () => typeof initial === "function" ? (initial as () => T)() : initial;
    if (typeof window === "undefined") return fallback();
    try {
      if (!localStorage.getItem(key) && !localStorage.getItem(`${key}:request`)) return fallback();
      const saved = JSON.parse(localStorage.getItem(`${key}:snapshot`) ?? "{}");
      return Object.prototype.hasOwnProperty.call(saved, field) ? saved[field] as T : fallback();
    } catch (error) {
      console.error("[browser round snapshot]", game, field, error);
      return fallback();
    }
  });
  const current = useRef(value);
  useEffect(() => {
    const restore = (event: Event) => {
      if ((event as CustomEvent).detail?.key !== key) return;
      const saved = JSON.parse(localStorage.getItem(`${key}:snapshot`) ?? "{}");
      const restored = localStorage.getItem(key) && Object.prototype.hasOwnProperty.call(saved, field)
        ? saved[field] as T : typeof initialValue.current === "function" ? (initialValue.current as () => T)() : initialValue.current;
      current.current = restored;
      setValue(restored);
    };
    window.addEventListener("wx:browser-resumed", restore);
    return () => window.removeEventListener("wx:browser-resumed", restore);
  }, [field, key]);
  const update = useCallback((next: T | ((previous: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(current.current) : next;
    // Persist synchronously, before React batching or navigation can interrupt this transition.
    const snapshot = JSON.parse(localStorage.getItem(`${key}:snapshot`) ?? "{}");
    snapshot[field] = resolved;
    localStorage.setItem(`${key}:snapshot`, JSON.stringify(snapshot));
    current.current = resolved;
    setValue(resolved);
  }, [field, key]);
  return [value, update] as const;
}

export const UNIFIED_BALANCE_KEY = "wx_unified_wallet_balance";

/**
 * All known localStorage balance keys across the game suite.
 * Synchronizing these keys ensures that every legacy or standalone component
 * reads the user's authentic wallet balance upon mounting!
 */
export const GAME_BALANCE_KEYS = [
  "windrop_balance_v1",
  "luckywheel.balance",
  "dc.balance",
  "tp999_balance",
  "race20_balance",
  "ludo-quick-balance",
  "ft-balance",
  "htdc_balance",
  "wx_red_vs_black_bal",
  "head-tail-casino-v1",
  "candy-comet-play-credits-v1",
  "three_card_poker_balance",
  "thai_hi_lo_balance",
  "tp_joker_balance",
  "tp_best_of_four",
  "tp_ak47_balance",
  "super_fruits_balance",
  "wx_monster_hilo",
  "monster-hilo-demo",
  "mini_roulette_balance",
  "keno_balance",
  "hotline_balance",
  "birds_beasts_balance",
  "casino_war_balance",
  "bollywood_casino_balance",
  "dream_catcher_balance",
  "poker_roulette_balance",
  "diao_chan_balance",
  "taixiu-practice-v1",
  "lucky-777-balance",
  "mines-balance",
  "limbo-balance",
  "aviator-balance",
  "casino-war-balance",
  "crash-goal:balance",
  "dream-wheel-studio-v1",
  "wx_hotline_balance",
  "keno.game.v1",
  "speed_baccarat_v1",
  "super-fruits-balance",
  "ak47_balance_v1",
  "tp-best-of-four-v1",
  "tp_faceoff_v1",
  "tpj_balance_v1",
  "tcp-bankroll",
  "rr_balance",
  "blastoff.v1",
];

const listeners = new Set<(balance: number) => void>();
let poolMode: boolean | null = null;
let walletOwner: string | null = null;

async function requireWalletOwner() {
  if (await fetchServerBalance() === null || !walletOwner) throw new Error("Authenticated wallet unavailable. Sign in before recovering a wager.");
  return walletOwner;
}

function assertWagerOwner(body: { ownerId?: string }, owner: string) {
  if (body.ownerId !== owner) throw new Error("This saved round belongs to another account. Sign in to its original account to resume; no wager was submitted.");
}

export function useDailyPoolMode() {
  const [enabled, setEnabled] = useState(poolMode === true);
  useEffect(() => {
    void fetchServerBalance().then(() => setEnabled(poolMode === true));
  }, []);
  return enabled;
}

function walletError(message: string) {
  window.dispatchEvent(new CustomEvent("wx:wallet-error", { detail: { error: message } }));
}

/** Independent explicit identities for engines that allow several simultaneous wagers (Fishing bullets). */
export async function concurrentBrowserWager(
  game: DailyPoolGame, action: "accept" | "complete", wagerId: string, amount: number,
) {
  const key = `wx:concurrent-wager:${game}:${wagerId}:${action}`;
  try {
    const ownerId = await requireWalletOwner();
    const saved = localStorage.getItem(key);
    const body = saved ? JSON.parse(saved) : {
      game, action, wagerId, ownerId, amount: Math.round(amount * 100) / 100,
      operationId: crypto.randomUUID(), poolVersion: dailyPoolConsent(game),
    };
    assertWagerOwner(body, ownerId);
    if (body.amount !== Math.round(amount * 100) / 100) throw new Error("The pending wager amount cannot change.");
    localStorage.setItem(key, JSON.stringify(body));
    const response = await fetch("/api/player/balance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const reply = await response.json();
    if (!response.ok || reply.ok !== true || !Number.isFinite(reply.balance) || reply.wagerId !== wagerId) {
      if (response.status >= 400 && response.status < 500) {
        localStorage.removeItem(key);
        if (action === "accept") localStorage.removeItem(`wx:projectile:${game}:${wagerId}`);
      }
      throw new Error(reply.error || "Wager confirmation failed. Retry the same wager.");
    }
    if (action === "complete") {
      localStorage.removeItem(key);
      localStorage.removeItem(`wx:concurrent-wager:${game}:${wagerId}:accept`);
      localStorage.removeItem(`wx:projectile:${game}:${wagerId}`);
    }
    broadcastBalanceUpdate(reply.balance, game);
    return reply as { balance: number; poolPending: boolean };
  } catch (error) {
    walletError(error instanceof Error ? error.message : "Wager confirmation failed.");
    return null;
  }
}

/** Persist the sampled shot and exact world before acceptance; a terminal claim is recorded only at collision. */
export async function acceptBrowserProjectile(game: DailyPoolGame, wagerId: string, stake: number, outcome: unknown, snapshot: unknown) {
  try {
    const ownerId = await requireWalletOwner();
    const key = `wx:projectile:${game}:${wagerId}`;
    const existing = JSON.parse(localStorage.getItem(key) ?? "null");
    if (existing) assertWagerOwner(existing, ownerId);
    saveBrowserEngine(game, snapshot);
    if (!existing) localStorage.setItem(key, JSON.stringify({ ownerId, wagerId, stake, claim: null, outcome }));
    return await concurrentBrowserWager(game, "accept", wagerId, stake) ? wagerId : null;
  } catch (error) {
    walletError(error instanceof Error ? error.message : "Projectile acceptance failed.");
    return null;
  }
}

export function saveBrowserEngine(game: DailyPoolGame, snapshot: unknown) {
  if (walletOwner) localStorage.setItem(`wx:browser-engine:${game}:${walletOwner}`, JSON.stringify(snapshot));
}

export async function completeBrowserProjectile(game: DailyPoolGame, wagerId: string, claim: number) {
  const key = `wx:projectile:${game}:${wagerId}`;
  const existing = JSON.parse(localStorage.getItem(key) ?? "null");
  if (!existing) throw new Error("Accepted projectile recovery record is missing.");
  if (walletOwner) assertWagerOwner(existing, walletOwner);
  if (existing.claim !== null && existing.claim !== claim) throw new Error("The projectile's actual terminal outcome cannot change.");
  localStorage.setItem(key, JSON.stringify({ ...existing, claim }));
  assertWagerOwner(existing, await requireWalletOwner());
  const reply = await concurrentBrowserWager(game, "complete", wagerId, claim);
  if (reply) notifyGameResult(game, wagerId, claim, reply.poolPending);
  return reply;
}

export async function recoverBrowserProjectiles(game: DailyPoolGame) {
  const ownerId = await requireWalletOwner();
  const snapshot = JSON.parse(localStorage.getItem(`wx:browser-engine:${game}:${ownerId}`) ?? "null");
  const prefix = `wx:projectile:${game}:`;
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => key !== null && key.startsWith(prefix));
  for (const key of keys) {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!saved || saved.ownerId !== ownerId) continue;
    if (saved.claim === null && snapshot?.pending?.wagerId !== saved.wagerId &&
      !snapshot?.bullets?.some((bullet: { wagerId: string }) => bullet.wagerId === saved.wagerId)) {
      throw new Error("The saved projectile simulation is incomplete. No new stake was submitted.");
    }
    // Replay acceptance only. An in-flight shot must resume its saved simulation, not an invented collision.
    if (!await concurrentBrowserWager(game, "accept", saved.wagerId, saved.stake)) continue;
    if (saved.claim !== null) await concurrentBrowserWager(game, "complete", saved.wagerId, saved.claim);
  }
  const activeIds = keys.filter(key => localStorage.getItem(key) !== null)
    .map(key => JSON.parse(localStorage.getItem(key)!)).filter(row => row.ownerId === ownerId).map(row => row.wagerId as string);
  return { snapshot: snapshot as unknown, activeIds };
}

/** Read cached wallet balance synchronously from localStorage */
export function getStoredWalletBalance(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const val = window.localStorage.getItem(UNIFIED_BALANCE_KEY);
    if (val !== null) {
      const num = parseFloat(val);
      if (Number.isFinite(num)) return Math.max(0, Math.round(num * 100) / 100);
    }
  } catch {
    /* storage unavailable */
  }
  return null;
}

/** Update all game storage keys in localStorage with the unified real balance */
export function syncAllStorageKeys(balance: number): void {
  if (typeof window === "undefined") return;
  const num = Math.max(0, Math.round(balance * 100) / 100);
  const numStr = String(num);

  try {
    window.localStorage.setItem(UNIFIED_BALANCE_KEY, numStr);

    for (const key of GAME_BALANCE_KEYS) {
      try {
        const existing = window.localStorage.getItem(key);
        if (existing && (existing.startsWith("{") || existing.startsWith("["))) {
          // Key holds JSON with balance property (e.g. head-tail-casino-v1, wx_monster_hilo)
          try {
            const parsed = JSON.parse(existing);
            if (parsed && typeof parsed === "object") {
              parsed.balance = num;
              window.localStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch {
            window.localStorage.setItem(key, numStr);
          }
        } else {
          // Key holds raw numeric string
          window.localStorage.setItem(key, numStr);
        }
      } catch {
        /* ignore storage error */
      }
    }
  } catch {
    /* ignore storage error */
  }

  // Notify in-process subscribers
  listeners.forEach((listener) => {
    try {
      listener(num);
    } catch (e) {
      console.error("[balance listener error]", e);
    }
  });
}

/** Subscribe to balance changes across windows and events */
export function subscribeWalletBalance(listener: (balance: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Broadcast balance update event to window & layout */
export function broadcastBalanceUpdate(newBalance: number, gameName?: string): void {
  if (typeof window === "undefined") return;
  syncAllStorageKeys(newBalance);
  window.dispatchEvent(
    new CustomEvent("wx:balance-update", {
      detail: { balance: newBalance, game: gameName },
    })
  );
  window.dispatchEvent(new CustomEvent("wx:session"));
}

/**
 * Report a game balance change (bet deducted or win credited).
 * Communicates with /api/player/balance to persist to DB and sync across the entire app.
 */
export async function reportGameBalanceChange(
  game: string,
  delta: number,
  newBalance?: number
): Promise<{ ok: boolean; balance: number; error?: string }> {
  if (typeof window === "undefined") return { ok: false, balance: newBalance ?? 0, error: "Browser wallet is unavailable." };

  const currentCached = getStoredWalletBalance() ?? 0;
  const targetBalance = typeof newBalance === "number" ? newBalance : Math.max(0, currentCached + delta);

  if (poolMode === true) {
    const error = "Daily-pool betting is not supported by this game's balance-delta interface.";
    walletError(error);
    return { ok: false, balance: currentCached, error };
  }

  try {
    const res = await fetch("/api/player/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, delta, newBalance: targetBalance }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      const serverBalance = Number(data.balance);
      if (Number.isFinite(serverBalance)) {
        syncAllStorageKeys(serverBalance);
        broadcastBalanceUpdate(serverBalance, game);
        return { ok: true, balance: serverBalance };
      }
    } else if (!res.ok || !data.ok) {
      // Revert if insufficient balance
      if (typeof data.balance === "number") {
        syncAllStorageKeys(data.balance);
        broadcastBalanceUpdate(data.balance, game);
      }
      const error = data.error || "Wallet update failed. Your wager was not confirmed.";
      broadcastBalanceUpdate(typeof data.balance === "number" ? data.balance : currentCached, game);
      walletError(error);
      return { ok: false, balance: data.balance ?? currentCached, error };
    }
  } catch (err) {
    console.warn("[reportGameBalanceChange network warning]", err);
  }

  broadcastBalanceUpdate(currentCached, game);
  const error = "Wallet confirmation failed. Please refresh before betting again.";
  walletError(error);
  return { ok: false, balance: currentCached, error };
}

/** Fetch fresh user balance from backend */
export async function fetchServerBalance(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/player/balance", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.dailyPoolEnabled === "boolean") poolMode = data.dailyPoolEnabled;
    if (data.loggedIn && typeof data.balance === "number") {
      walletOwner = typeof data.user?.id === "string" ? data.user.id : null;
      syncAllStorageKeys(data.balance);
      broadcastBalanceUpdate(data.balance);
      return data.balance;
    }
  } catch {
    /* fetch error */
  }
  return null;
}

/**
 * React Hook for any game component.
 * Replaces `useState(START_BALANCE)` with a real-money synchronized balance!
 *
 * Usage:
 * const [balance, setBalance] = useGameBalance("teen-patti", 1000);
 */
export function useGameBalance(gameSlug: string, fallbackInitial = 1000) {
  const [balance, setBalanceState] = useState<number>(() => {
    const stored = getStoredWalletBalance();
    return stored !== null ? stored : fallbackInitial;
  });

  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  // Initialize from server balance on mount
  useEffect(() => {
    let alive = true;
    fetchServerBalance().then((serverBal) => {
      if (alive && serverBal !== null) {
        setBalanceState(serverBal);
      }
    });

    const unsubscribe = subscribeWalletBalance((newBal) => {
      if (alive) {
        setBalanceState(newBal);
      }
    });

    const handleCustomUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.balance === "number" && alive) {
        setBalanceState(detail.balance);
      }
    };

    window.addEventListener("wx:balance-update", handleCustomUpdate);

    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("wx:balance-update", handleCustomUpdate);
    };
  }, []);

  const setBalance = useCallback(
    (valueOrUpdater: number | ((prev: number) => number)) => {
      if (poolMode !== false) {
        walletError(poolMode === true
          ? "New betting is disabled for this browser game until its explicit daily-pool wager lifecycle is available."
          : "Wait for the server wallet configuration before betting.");
        return;
      }
      const prev = balanceRef.current;
      const next = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
      const rounded = Math.round(next * 100) / 100;
      const delta = Math.round((rounded - prev) * 100) / 100;
      balanceRef.current = rounded;
      setBalanceState(rounded);
      if (delta !== 0) {
        void reportGameBalanceChange(gameSlug, delta, rounded);
      }
    },
    [gameSlug]
  );

  return [balance, setBalance] as const;
}

type BrowserWagerReply = { ok: true; balance: number; wagerId: string; claim: number; poolPending: boolean; replay: boolean; outcome?: unknown };
type BrowserWagerRequest = { action: "play" | "server-play"; game: string; wagerId: string; ownerId: string; stake: number; claim: number; poolVersion?: string; selection?: unknown };

/** Instant rounds submit a real stake and explicit terminal claim, never a wallet delta. */
export function useBrowserWager(game: DailyPoolGame, fallbackInitial = 1000) {
  const [balance] = useGameBalance(game, fallbackInitial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const key = `wx:browser-wager:${game}`;

  const send = useCallback(async (body: BrowserWagerRequest): Promise<BrowserWagerReply> => {
    assertWagerOwner(body, await requireWalletOwner());
    const response = await fetch("/api/player/balance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const reply = await response.json();
    if (!response.ok || reply.ok !== true || !Number.isFinite(reply.balance) || reply.wagerId !== body.wagerId) {
      if (response.status >= 400 && response.status < 500) localStorage.removeItem(key);
      throw new Error(reply.error || "Wager confirmation failed. Retry before placing another bet.");
    }
    localStorage.removeItem(key);
    broadcastBalanceUpdate(reply.balance, game);
    return reply;
  }, [game, key]);

  const recover = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const body = JSON.parse(saved) as BrowserWagerRequest;
        if (body.game !== game || !["play", "server-play"].includes(body.action)) throw new Error("Stored wager is invalid. Contact support.");
        const reply = await send(body);
        notifyGameResult(game, reply.wagerId, reply.claim, reply.poolPending);
      }
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Wager retry failed.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [game, key, send]);

  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => { if (!disposed) void recover(); });
    return () => { disposed = true; };
  }, [recover]);

  const play = useCallback(async (stake: number, claim: number, selection?: unknown) => {
    if (busy.current) throw new Error("Wait for the current wager confirmation.");
    busy.current = true;
    setPending(true);
    try {
      if (localStorage.getItem(key)) throw new Error("A previous wager needs confirmation. Use Retry first.");
      const ownerId = await requireWalletOwner();
      const body: BrowserWagerRequest = {
        action: selection === undefined ? "play" : "server-play", game, wagerId: crypto.randomUUID(), stake, claim, selection, ownerId,
        poolVersion: dailyPoolConsent(game as DailyPoolGame),
      };
      // Persist BEFORE submitting: a lost response must replay this exact outcome and identity.
      localStorage.setItem(key, JSON.stringify(body));
      const reply = await send(body);
      setError(null);
      return reply;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Wager failed. Retry before betting again.";
      setError(message);
      throw failure;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [game, key, send]);

  return { balance, play, playServer: (stake: number, selection: unknown) => play(stake, 0, selection), pending, error, retry: recover };
}

/** Explicit accepted wagers in both accounting modes; callbacks never mutate the authoritative wallet. */
export function usePoolLifecycle(game: DailyPoolGame, slot = "main") {
  const key = `wx:browser-active:${game}:${slot}`;
  const active = useRef<string | null>(typeof window === "undefined" ? null : localStorage.getItem(key));
  const busy = useRef(false);
  const outcome = useRef<unknown>(null);
  const pendingSettlement = useRef(false);
  const resolvedWager = useRef<string | null>(null);
  const [enabled, setEnabled] = useState(!isCardGame(game) && !isRouletteGame(game) && !isSlotGame(game) && game !== "thai-hi-lo" && poolMode === true);
  const recovering = useRef(false);
  const mountedRecovery = useRef(typeof window !== "undefined" &&
    Boolean(localStorage.getItem(`${key}:request`) || localStorage.getItem(key)));

  const execute = useCallback(async (
    action: "accept" | "increment" | "complete" | "refund" | "award" | "reduce" | "resolve" | "card-action", amount: number, _legacy: () => void, selection?: unknown,
  ) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const ownerId = await requireWalletOwner();
      if (poolMode === null) throw new Error("Wallet configuration is unavailable. Retry before betting.");
      setEnabled(!isCardGame(game) && !isRouletteGame(game) && !isSlotGame(game) && game !== "thai-hi-lo" && poolMode);
      const pendingKey = `${key}:request`;
      const pending = localStorage.getItem(pendingKey);
      const savedOwner = localStorage.getItem(`${key}:owner`);
      if ((active.current || pending) && savedOwner !== ownerId) throw new Error("This saved round belongs to another account. Sign in to its original account to resume.");
      const planned = JSON.parse(localStorage.getItem(`${key}:terminal`) ?? "null");
      if (planned?.ownerId && planned.ownerId !== ownerId) throw new Error("The saved outcome belongs to another account.");
      const continuation = JSON.parse(localStorage.getItem(`${key}:continuation`) ?? "null");
      if (continuation?.ownerId && continuation.ownerId !== ownerId) throw new Error("The saved continuation belongs to another account.");
      const nextStep = continuation?.steps?.[0];
      if (nextStep && action !== "accept" && (nextStep.action !== action || nextStep.amount !== Math.round(amount * 100) / 100)) {
        throw new Error("Finish the saved round action before choosing another action.");
      }
      if (action === "accept" && active.current && !pending) throw new Error("Finish the previously accepted wager before placing another.");
      if (action !== "accept" && !active.current) throw new Error("No accepted pool wager exists for this action.");
      const body = pending ? JSON.parse(pending) : {
        game, action, ownerId, amount: Math.round(amount * 100) / 100,
        wagerId: active.current ?? planned?.wagerId ?? continuation?.wagerId ?? crypto.randomUUID(),
        operationId: nextStep && action !== "accept" ? nextStep.operationId : crypto.randomUUID(),
        poolVersion: (isCardGame(game) || isRouletteGame(game) || isSlotGame(game) || game === "thai-hi-lo") && action === "accept" ? undefined : dailyPoolConsent(game),
        selection,
      };
      assertWagerOwner(body, ownerId);
      if (body.action !== action || body.amount !== Math.round(amount * 100) / 100) throw new Error("A previous wager action needs confirmation before another action can run.");
      if (action === "card-action" && JSON.stringify(body.selection) !== JSON.stringify(selection)) {
        throw new Error("The previous card move needs confirmation before choosing another move.");
      }
      localStorage.setItem(pendingKey, JSON.stringify(body));
      localStorage.setItem(`${key}:owner`, ownerId);
      if (action === "accept" && planned) localStorage.setItem(`${key}:terminal`, JSON.stringify({ ...planned, ownerId }));
      if (action === "accept" && continuation) localStorage.setItem(`${key}:continuation`, JSON.stringify({ ...continuation, ownerId }));
      if (action === "complete") localStorage.setItem(`${key}:terminal`, JSON.stringify({ wagerId: body.wagerId, ownerId, claim: body.amount }));
      const response = await fetch("/api/player/balance", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const reply = await response.json();
      if (!response.ok || reply.ok !== true || !Number.isFinite(reply.balance) || reply.wagerId !== body.wagerId) {
        if (response.status >= 400 && response.status < 500) {
          localStorage.removeItem(pendingKey);
          setEnabled(reply.poolPending === true);
          pendingSettlement.current = reply.poolPending === true;
          const previous = localStorage.getItem(`${key}:rollback`);
          if (previous !== null) localStorage.setItem(`${key}:snapshot`, previous);
          localStorage.removeItem(`${key}:rollback`);
          if (action === "accept" && !active.current) {
            localStorage.removeItem(`${key}:terminal`);
            localStorage.removeItem(`${key}:continuation`);
            localStorage.removeItem(`${key}:selection`);
            localStorage.removeItem(`${key}:snapshot`);
            localStorage.removeItem(`${key}:selection`);
          }
        }
        throw new Error(reply.error || "Wager confirmation failed. Repeat the same action to retry.");
      }
      localStorage.removeItem(pendingKey);
      localStorage.removeItem(`${key}:rollback`);
      pendingSettlement.current = reply.poolPending === true;
      if (continuation && nextStep?.operationId === body.operationId) {
        continuation.steps.shift();
        if (continuation.steps.length) localStorage.setItem(`${key}:continuation`, JSON.stringify(continuation));
        else localStorage.removeItem(`${key}:continuation`);
      }
      if (action === "complete" || action === "refund" || action === "resolve" || reply.status === "closed" || reply.status === "refunded") {
        active.current = null;
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}:terminal`);
        localStorage.removeItem(`${key}:snapshot`);
        localStorage.removeItem(`${key}:continuation`);
        localStorage.removeItem(`${key}:selection`);
      } else {
        active.current = body.wagerId;
        localStorage.setItem(key, body.wagerId);
      }
      broadcastBalanceUpdate(reply.balance, game);
      outcome.current = reply.outcome;
      if (action === "resolve" || action === "card-action" && reply.status === "closed") resolvedWager.current = body.wagerId;
      if (action === "complete" || action === "resolve" && game === "treasure-bowl") notifyGameResult(game, body.wagerId,
        typeof reply.claim === "number" ? reply.claim : body.amount, reply.poolPending === true);
      return true;
    } catch (error) {
      walletError(error instanceof Error ? error.message : "Wager action failed. Repeat the same action to retry.");
      return false;
    } finally {
      busy.current = false;
    }
  }, [game, key]);

  const resume = useCallback(async (isDisposed: () => boolean = () => false) => {
    if (recovering.current || busy.current) return false;
    if (!active.current && !localStorage.getItem(`${key}:request`) &&
      !localStorage.getItem(`${key}:terminal`) && !localStorage.getItem(`${key}:continuation`)) return true;
    recovering.current = true;
    try {
      const ownerId = await requireWalletOwner();
      if (isDisposed()) return false;
      setEnabled(!isCardGame(game) && !isRouletteGame(game) && !isSlotGame(game) && game !== "thai-hi-lo" && poolMode === true);
      const notifyRecoveredSlot = (wagerId: string) => {
        const resolved = outcome.current;
        if (!resolved || typeof resolved !== "object" || !("payout" in resolved) ||
            typeof resolved.payout !== "number") throw new Error("Saved spin result could not be verified.");
        notifyGameResult(game, wagerId, resolved.payout, pendingSettlement.current);
      };
      const request = JSON.parse(localStorage.getItem(`${key}:request`) ?? "null");
      if (request && !await execute(request.action, request.amount, () => {}, request.selection)) return false;
      if (request?.action === "resolve" && (game === "thai-hi-lo" || isSlotGame(game) && game !== "treasure-bowl" || isCardGame(game) || isBrowserRouletteGame(game))) {
        notifyRecoveredSlot(request.wagerId);
      }
      if (request?.action === "card-action" && !active.current) notifyRecoveredSlot(request.wagerId);
      for (;;) {
        const continuation = JSON.parse(localStorage.getItem(`${key}:continuation`) ?? "null");
        const step = continuation?.steps?.[0];
        if (!step || !active.current) break;
        assertWagerOwner(continuation, ownerId);
        if (!await execute(step.action, step.amount, () => {})) return false;
      }
      const terminal = JSON.parse(localStorage.getItem(`${key}:terminal`) ?? "null");
      const savedSelection = JSON.parse(localStorage.getItem(`${key}:selection`) ?? "null");
      if (!isInteractiveBrowserCardGame(game) &&
          (game === "treasure-bowl" || !terminal && (game === "super-fruits" || game === "sweet-bonanza" || isAutoResolveBrowserCardGame(game) || savedSelection !== null)) && active.current) {
        const wagerId = active.current;
        if (!await execute("resolve", 0, () => {}, savedSelection ?? {})) return false;
        if (game === "thai-hi-lo" || isSlotGame(game) && game !== "treasure-bowl" || isCardGame(game) || isBrowserRouletteGame(game)) {
          notifyRecoveredSlot(wagerId);
        }
        mountedRecovery.current = false;
        return true;
      }
      if (terminal && active.current === terminal.wagerId) {
        assertWagerOwner(terminal, ownerId);
        if (await execute("complete", terminal.claim, () => {})) {
          mountedRecovery.current = false;
          walletError("The saved round finished with its original result. Your authoritative wallet has been synchronized.");
        }
      } else if (terminal && !active.current) localStorage.removeItem(`${key}:terminal`);
      return !active.current && !localStorage.getItem(`${key}:request`);
    } catch (error) {
      walletError(error instanceof Error ? error.message : "Saved round recovery failed. Retry without changing the result.");
      return false;
    } finally {
      recovering.current = false;
      window.dispatchEvent(new CustomEvent("wx:browser-resumed", { detail: { key } }));
    }
  }, [execute, game, key]);

  useEffect(() => {
    let disposed = false;
    const recover = async () => {
      if (mountedRecovery.current) await resume(() => disposed);
    };
    void recover();
    const online = () => { void recover(); };
    window.addEventListener("online", online);
    return () => { disposed = true; window.removeEventListener("online", online); };
  }, [resume]);

  return {
    get enabled() { return enabled || !isCardGame(game) && !isRouletteGame(game) && !isSlotGame(game) && game !== "thai-hi-lo" && poolMode === true; },
    get busy() { return busy.current || recovering.current; },
    announce: () => {
      const resolved = outcome.current;
      if (resolvedWager.current && resolved && typeof resolved === "object" &&
          "payout" in resolved && typeof resolved.payout === "number") {
        notifyGameResult(game, resolvedWager.current, resolved.payout, pendingSettlement.current);
      }
    },
    resume: () => resume(),
    queue: (steps: { action: "increment" | "reduce" | "award" | "complete"; amount: number }[]) => {
      if (localStorage.getItem(`${key}:continuation`)) throw new Error("The previous saved round transition still needs confirmation.");
      localStorage.setItem(`${key}:continuation`, JSON.stringify({
        ownerId: walletOwner, wagerId: active.current ?? crypto.randomUUID(),
        steps: steps.map(step => ({ ...step, amount: Math.round(step.amount * 100) / 100, operationId: crypto.randomUUID() })),
      }));
    },
    /** Save an already determined terminal result BEFORE acceptance/animation, never invent one at recovery. */
    plan: (claim: number, engineOutcome?: unknown) => {
      const existing = JSON.parse(localStorage.getItem(`${key}:terminal`) ?? "null");
      if (existing && existing.claim !== Math.round(claim * 100) / 100) throw new Error("The saved round outcome cannot change.");
      localStorage.setItem(`${key}:terminal`, JSON.stringify({
        wagerId: existing?.wagerId ?? active.current ?? crypto.randomUUID(),
        ownerId: walletOwner, claim: Math.round(claim * 100) / 100, engineOutcome,
      }));
    },
    checkpoint: (snapshot: Record<string, unknown>) => {
      const previous = localStorage.getItem(`${key}:snapshot`) ?? "{}";
      if (!localStorage.getItem(`${key}:request`)) localStorage.setItem(`${key}:rollback`, previous);
      localStorage.setItem(`${key}:snapshot`, JSON.stringify({ ...JSON.parse(previous), ...snapshot }));
    },
    start: (stake: number, legacy: () => void = () => {}, selection?: unknown) => {
      if (selection !== undefined && !active.current && !localStorage.getItem(`${key}:request`)) {
        localStorage.setItem(`${key}:selection`, JSON.stringify(selection));
      }
      return execute("accept", stake, legacy);
    },
    stake: (stake: number) => execute(active.current ? "increment" : "accept", stake, () => {}),
    reduce: (stake: number) => execute("reduce", stake, () => {}),
    increment: (stake: number, legacy: () => void = () => {}) => execute("increment", stake, legacy),
    award: (claim: number) => execute("award", claim, () => {}),
    resolveServer: async (selection: unknown) => {
      localStorage.setItem(`${key}:selection`, JSON.stringify(selection));
      return await execute("resolve", 0, () => {}, selection) ? outcome.current : null;
    },
    cardAction: async (move: string, selection?: unknown) =>
      await execute("card-action", 0, () => {}, { move, selection }) ? outcome.current : null,
    complete: (claim: number, legacy: () => void = () => {}) => {
      const terminal = JSON.parse(localStorage.getItem(`${key}:terminal`) ?? "null");
      if (terminal && terminal.claim !== Math.round(claim * 100) / 100) {
        walletError("The saved terminal claim cannot change. Reopen this game to confirm its original result.");
        return Promise.resolve(false);
      }
      if (active.current && !terminal) localStorage.setItem(`${key}:terminal`, JSON.stringify({
        wagerId: active.current, ownerId: walletOwner ?? localStorage.getItem(`${key}:owner`),
        claim: Math.round(claim * 100) / 100,
      }));
      return execute("complete", claim, legacy);
    },
    refund: (legacy: () => void = () => {}) => execute("refund", 0, legacy),
  };
}
