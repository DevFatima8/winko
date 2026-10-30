"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MultiplayerAction, MultiplayerGame, MultiplayerReply, MultiplayerState } from "./multiplayer-types";
import { broadcastBalanceUpdate } from "./walletSync";
import { dailyPoolConsent } from "./dailyPoolConsent";
import { notifyGameResult } from "./gameResultNotice";
import { isCardGame } from "./cardGameRules";
import { isRouletteGame } from "./rouletteGameRules";

export function useMultiplayerGame<R = unknown>(game: MultiplayerGame) {
  const [state, setState] = useState<MultiplayerState<R> | null>(null);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const stateRef = useRef<MultiplayerState<R> | null>(null);
  const mounted = useRef(false);
  const offset = useRef(0);
  const pendingRead = useRef<Promise<void> | null>(null);
  const readController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const lastBalance = useRef<number | null>(null);
  const reportedBets = useRef(new Set<string>());

  useEffect(() => {
    if (!state) return;
    const groups = new Map<number, typeof state.myBets>();
    for (const bet of state.myBets) {
      if ((bet.status !== "win" && bet.status !== "lose") || reportedBets.current.has(bet.id)) continue;
      reportedBets.current.add(bet.id);
      const group = groups.get(bet.roundNo) ?? [];
      group.push(bet);
      groups.set(bet.roundNo, group);
    }
    for (const [roundNo, bets] of groups) {
      const pending = bets.some(bet => bet.poolPending);
      const amount = bets.reduce((sum, bet) => sum + (bet.poolPending ? bet.poolClaim ?? 0 : bet.payout), 0);
      notifyGameResult(game, `${roundNo}:${bets.map(bet => bet.id).sort().join(",")}`, amount, pending);
    }
  }, [state, game]);

  const refresh = useCallback((): Promise<void> => {
    if (pendingRead.current) return pendingRead.current;
    if (!mounted.current) return Promise.resolve();
    const controller = new AbortController();
    readController.current = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException("Live table request timed out.", "TimeoutError")), 15000);
    const request = (async () => {
      try {
        const response = await fetch(`/api/multiplayer/${game}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Live table unavailable (${response.status}). Reconnecting.`);
        const next: MultiplayerState<R> = await response.json();
        if (!mounted.current || controller.signal.aborted) return;
        offset.current = next.serverNow - Date.now();
        stateRef.current = next;
        setState(next);
        setNow(next.serverNow);
        setConnectionError("");
        if (typeof next.balance === "number" && lastBalance.current !== next.balance) {
          lastBalance.current = next.balance;
          broadcastBalanceUpdate(next.balance, game);
        }
      } catch (cause) {
        if (mounted.current && readController.current === controller) {
          if (controller.signal.aborted) {
            const message = "Live connection timed out. Reconnecting; check bet status before playing.";
            console.warn("[multiplayer state]", game, message);
            setConnectionError(message);
          } else {
            console.error("[multiplayer state]", game, cause);
            setConnectionError("Live connection interrupted. Reconnecting; check bet status before playing.");
          }
        }
      } finally {
        clearTimeout(timeout);
        if (readController.current === controller) {
          readController.current = null;
          pendingRead.current = null;
        }
      }
    })();
    pendingRead.current = request;
    return request;
  }, [game]);

  useEffect(() => {
    mounted.current = true;
    stateRef.current = null;
    lastBalance.current = null;
    reportedBets.current.clear();
    void refresh();
    const polling = setInterval(() => { void refresh(); }, 1000);
    const clock = setInterval(() => setNow(Date.now() + offset.current), 100);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      clearInterval(polling);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
      readController.current?.abort();
      actionController.current?.abort();
      readController.current = null;
      pendingRead.current = null;
      actionController.current = null;
    };
  }, [refresh]);

  const send = useCallback(async (action: Omit<MultiplayerAction, "requestId">): Promise<MultiplayerReply> => {
    if (actionController.current) {
      const message = "A request is already in progress. Please wait.";
      setError(message);
      return { error: message };
    }
    const controller = new AbortController();
    actionController.current = controller;
    setBusy(true);
    const timeout = setTimeout(() => controller.abort(new DOMException("Multiplayer action request timed out.", "TimeoutError")), 20000);
    try {
      const response = await fetch(`/api/multiplayer/${game}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...action, ...(action.action === "bet" ? { poolRulesVersion: dailyPoolConsent(game) } : {}), requestId: crypto.randomUUID() }),
        signal: controller.signal,
      });
      const reply: MultiplayerReply = await response.json();
      if (!response.ok && !("error" in reply)) throw new Error(`Bet request failed (${response.status}).`);
      clearTimeout(timeout);
      if (!mounted.current || controller.signal.aborted || actionController.current !== controller) return reply;
      setError("error" in reply ? reply.error : "");
      await refresh();
      return reply;
    } catch (cause) {
      if (!mounted.current || actionController.current !== controller) return { error: "Request cancelled." };
      const message = controller.signal.aborted
        ? "Request timed out. Your action may already have been accepted. Check bet status before trying again."
        : "Connection interrupted. Check bet status before trying again.";
      if (controller.signal.aborted) console.warn("[multiplayer action]", game, message);
      else console.error("[multiplayer action]", game, cause);
      setError(message);
      void refresh();
      return { error: message };
    } finally {
      clearTimeout(timeout);
      if (actionController.current === controller) {
        actionController.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }, [game, refresh]);

  const place = useCallback((option: string, amount: number, autoCashout?: number) => {
    const current = stateRef.current;
    if (!current) {
      const message = "Live table is still connecting. Please wait.";
      setError(message);
      return Promise.resolve<MultiplayerReply>({ error: message });
    }
    const open = current.round.phase === "betting" && Date.now() + offset.current < current.round.bettingEndsAt;
    if (!open && (isCardGame(game) || isRouletteGame(game))) {
      const message = "Betting is closed. Wait for the next round to begin.";
      setError(message);
      return Promise.resolve<MultiplayerReply>({ error: message });
    }
    return send({ action: "bet", roundNo: current.round.roundNo + (open ? 0 : 1), option, amount, autoCashout });
  }, [game, send]);

  const cancel = useCallback((roundNo: number, betId?: string) =>
    send({ action: "cancel", roundNo, betId }), [send]);

  const cashout = useCallback((betId?: string) => {
    const current = stateRef.current;
    if (!current) {
      const message = "Live table is still connecting. Please wait.";
      setError(message);
      return Promise.resolve<MultiplayerReply>({ error: message });
    }
    return send({ action: "cashout", roundNo: current.round.roundNo, betId });
  }, [send]);

  return { state, now, error: connectionError || error, busy, place, cancel, cashout, refresh };
}
