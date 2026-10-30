"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import {
  crashDeckEngine,
  GamePhase,
  generateInitialHistory,
  generateSimulatedBetsForRound,
  LiveBetEntry,
  OutcomeBucket,
  RoundHistoryItem,
  UserBetRecord,
} from "./lib/crashEngine";
import { soundEngine } from "./lib/soundEngine";
import { visibleAnimationFrame } from "@/lib/visibleAnimationFrame";
import { cashoutLimitReached } from "@/lib/crashCashoutLimit";
import "./crash-cricket.css";
import CricketFlightCanvas, { CashoutToast } from "./CricketFlightCanvas";
import BetControlPanel, { BetPanelState } from "./BetControlPanel";
import LiveBetsSidebar from "./LiveBetsSidebar";
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  History,
  Percent,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";

export default function CrashCricketApp() {
  type SavedRound = {
    phase: GamePhase; started: number; roundId: number; panel1: BetPanelState; panel2: BetPanelState;
    target: { crashPoint: number; bucket: OutcomeBucket; dismissalType: string; hash: string };
  };
  const [savedOne] = usePoolRoundState<SavedRound | null>("crash-cricket", "machine", null, "panel-1");
  const [savedTwo] = usePoolRoundState<SavedRound | null>("crash-cricket", "machine", null, "panel-2");
  const recovered = savedOne ?? savedTwo;
  const phaseStarted = useRef(recovered?.started ?? Date.now());
  // Wallet & Audio State
  const [balance] = useGameBalance("crash-cricket", 10000);
  const poolOne = usePoolLifecycle("crash-cricket", "panel-1");
  const poolTwo = usePoolLifecycle("crash-cricket", "panel-2");
  const poolFor = (panelId: 1 | 2) => panelId === 1 ? poolOne : poolTwo;
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Game Loop State
  const [roundId, setRoundId] = useState<number>(recovered?.roundId ?? 8440);
  const [phase, setPhase] = useState<GamePhase>(recovered?.phase ?? "BETTING");
  const [countdown, setCountdown] = useState<number>(5.0);
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [dismissalText, setDismissalText] = useState<string>("");

  // History & Live Bets State
  const [roundHistory, setRoundHistory] = useState<RoundHistoryItem[]>(() =>
    generateInitialHistory()
  );
  const [liveBets, setLiveBets] = useState<LiveBetEntry[]>(() =>
    generateSimulatedBetsForRound()
  );
  const liveBetsRef = useRef(liveBets);
  useEffect(() => {
    liveBetsRef.current = liveBets;
  }, [liveBets]);
  const [userBetHistory, setUserBetHistory] = useState<UserBetRecord[]>([]);
  const [cashoutToasts, setCashoutToasts] = useState<CashoutToast[]>([]);

  // UI Modals & Drawers
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [showFairModal, setShowFairModal] = useState<boolean>(false);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  // Dual Bet Controllers State (Panel 1 & Panel 2)
  const [panel1, setPanel1] = useState<BetPanelState>(recovered?.panel1 ?? {
    stake: 100,
    isBetPlaced: false,
    isBetQueued: false,
    cashedOutAt: null,
    winAmount: null,
    autoBet: false,
    autoCashoutEnabled: false,
    autoCashoutTarget: 2.0,
  });

  const [panel2, setPanel2] = useState<BetPanelState>(recovered?.panel2 ?? {
    stake: 500,
    isBetPlaced: false,
    isBetQueued: false,
    cashedOutAt: null,
    winAmount: null,
    autoBet: false,
    autoCashoutEnabled: true,
    autoCashoutTarget: 2.5,
  });

  // Refs for real-time 60fps loop access
  const panel1Ref = useRef(panel1);
  const panel2Ref = useRef(panel2);
  const balanceRef = useRef(balance);
  const roundIdRef = useRef(roundId);
  const phaseRef = useRef<GamePhase>(recovered?.phase ?? "BETTING");
  const activeRef = useRef(false);
  useEffect(() => {
    soundEngine.setMuted(isMuted);
  }, [isMuted]);
  useEffect(() => {
    activeRef.current = true;
    const onVisibility = () => {
      soundEngine.setActive(!document.hidden);
      if (!document.hidden && phaseRef.current === "IN_FLIGHT") soundEngine.startFlightSound();
    };
    const onHide = () => soundEngine.setActive(false);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      activeRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onVisibility);
      soundEngine.setActive(false);
    };
  }, []);
  const queuedPanels = useRef<Partial<Record<1 | 2, BetPanelState>>>({});
  const recordedLossRound = useRef<number | null>(null);
  const toastTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => () => {
    toastTimers.current.forEach(clearTimeout);
  }, []);
  const currentRoundTargetRef = useRef<{
    crashPoint: number;
    bucket: OutcomeBucket;
    dismissalType: string;
    hash: string;
  }>(recovered?.target ?? {
    crashPoint: 1.42,
    bucket: "LOSS_65",
    dismissalType: "CLEAN BOWLED! Middle Stump Cartwheeling!",
    hash: "",
  });

  const saveMachine = (patch: Partial<Pick<SavedRound, "panel1" | "panel2">> = {}) => {
    const machine: SavedRound = {
      phase: phaseRef.current, started: phaseStarted.current, roundId: roundIdRef.current,
      target: currentRoundTargetRef.current, panel1: panel1Ref.current, panel2: panel2Ref.current, ...patch,
    };
    poolOne.checkpoint({ machine });
    poolTwo.checkpoint({ machine });
  };

  useEffect(() => {
    panel1Ref.current = panel1;
  }, [panel1]);

  useEffect(() => {
    panel2Ref.current = panel2;
  }, [panel2]);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    roundIdRef.current = roundId;
  }, [roundId]);

  const updatePanelState = useCallback(
    (panelId: 1 | 2, updater: (prev: BetPanelState) => BetPanelState) => {
      if (panelId === 1) {
        panel1Ref.current = updater(panel1Ref.current);
        setPanel1(panel1Ref.current);
      } else {
        panel2Ref.current = updater(panel2Ref.current);
        setPanel2(panel2Ref.current);
      }
      saveMachine();
    },
    []
  );

  // Add User Bet into the All Bets Live Feed
  const injectUserBetIntoFeed = useCallback(
    (panelId: 1 | 2, stakeAmount: number, targetCashout: number) => {
      const entryId = `user-p${panelId}`;
      setLiveBets((prev) => {
        const filtered = prev.filter((b) => b.id !== entryId);
        const userEntry: LiveBetEntry = {
          id: entryId,
          username: `YOU (Bet #${panelId})`,
          avatarColor: panelId === 1 ? "#00E701" : "#38BDF8",
          isUser: true,
          panelId,
          betAmount: stakeAmount,
          targetCashout,
          cashedOutAt: null,
          winAmount: null,
        };
        return [userEntry, ...filtered];
      });
    },
    []
  );

  // Remove User Bet from Live Feed if cancelled during BETTING
  const removeUserBetFromFeed = useCallback((panelId: 1 | 2) => {
    const entryId = `user-p${panelId}`;
    setLiveBets((prev) => prev.filter((b) => b.id !== entryId));
  }, []);

  // Place or Queue Bet Handler
  const handlePlaceOrQueueBet = useCallback(
    async (panelId: 1 | 2) => {
      soundEngine.playClick();
      const targetPanel = panelId === 1 ? panel1Ref.current : panel2Ref.current;
      const currentPhase = phaseRef.current;
      if (targetPanel.isBetQueued || (targetPanel.isBetPlaced && currentPhase === "BETTING")) return;
      if (!Number.isFinite(targetPanel.stake) || targetPanel.stake <= 0 || balanceRef.current < targetPanel.stake) {
        updatePanelState(panelId, (prev) => ({ ...prev, status: "Bet rejected — invalid stake or insufficient balance" }));
        return;
      }

      if (currentPhase === "BETTING") {
        saveMachine({ [panelId === 1 ? "panel1" : "panel2"]: { ...targetPanel, isBetPlaced: true, isBetQueued: false, cashedOutAt: null, winAmount: null } });
        if (!await poolFor(panelId).start(targetPanel.stake)) return;
        updatePanelState(panelId, (prev) => ({
          ...prev,
          isBetPlaced: true,
          isBetQueued: false,
          cashedOutAt: null,
          winAmount: null,
          status: "Bet accepted for this round",
        }));
        injectUserBetIntoFeed(
          panelId,
          targetPanel.stake,
          targetPanel.autoCashoutTarget
        );
      } else {
        // Queue for next round
        queuedPanels.current[panelId] = { ...targetPanel };
        updatePanelState(panelId, (prev) => ({
          ...prev,
          isBetQueued: true,
          status: "Queued for next round — not yet charged",
        }));
      }
    },
    [phase, updatePanelState, injectUserBetIntoFeed]
  );

  // Cancel Bet Handler
  const handleCancelBet = useCallback(
    async (panelId: 1 | 2) => {
      soundEngine.playClick();
      const targetPanel = panelId === 1 ? panel1Ref.current : panel2Ref.current;

      if (targetPanel.isBetQueued) {
        delete queuedPanels.current[panelId];
        updatePanelState(panelId, (prev) => ({
          ...prev,
          isBetQueued: false,
          status: "Queued bet cancelled",
        }));
        return;
      }

      if (phaseRef.current === "BETTING" && targetPanel.isBetPlaced) {
        // Refund stake
        if (!await poolFor(panelId).refund()) return;
        updatePanelState(panelId, (prev) => ({
          ...prev,
          isBetPlaced: false,
          cashedOutAt: null,
          winAmount: null,
          status: "Bet cancelled — stake returned",
        }));
        removeUserBetFromFeed(panelId);
      }
    },
    [phase, updatePanelState, removeUserBetFromFeed]
  );

  // Execute Cashout for a Panel
  const executeCashOut = useCallback(
    async (panelId: 1 | 2, cashoutMult: number) => {
      const targetPanel = panelId === 1 ? panel1Ref.current : panel2Ref.current;
      if (phaseRef.current !== "IN_FLIGHT" || !targetPanel.isBetPlaced || targetPanel.cashedOutAt !== null) return;

      const winAmount = Number((targetPanel.stake * cashoutMult).toFixed(2));
      const profit = Number((winAmount - targetPanel.stake).toFixed(2));

      soundEngine.playCashoutWin();

      // Credit wallet
      saveMachine({ [panelId === 1 ? "panel1" : "panel2"]: { ...targetPanel, cashedOutAt: cashoutMult, winAmount } });
      if (!await poolFor(panelId).complete(winAmount)) return;

      // Mark panel as cashed out
      updatePanelState(panelId, (prev) => ({
        ...prev,
        cashedOutAt: cashoutMult,
        winAmount,
      }));

      // Update immediately in ref so duplicate frames don't double-cashout
      if (panelId === 1) {
        panel1Ref.current = {
          ...panel1Ref.current,
          cashedOutAt: cashoutMult,
          winAmount,
        };
      } else {
        panel2Ref.current = {
          ...panel2Ref.current,
          cashedOutAt: cashoutMult,
          winAmount,
        };
      }

      // Highlight row in All Bets Feed
      const entryId = `user-p${panelId}`;
      setLiveBets((prev) =>
        prev.map((b) =>
          b.id === entryId
            ? { ...b, cashedOutAt: cashoutMult, winAmount }
            : b
        )
      );

      // Push floating celebration toast
      if (activeRef.current) {
        const toastId = `toast-${Date.now()}-${panelId}`;
        setCashoutToasts((prev) => [
          ...prev,
          { id: toastId, panelId, multiplier: cashoutMult, winAmount },
        ]);
        const timer = setTimeout(() => {
          toastTimers.current.delete(timer);
          setCashoutToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 3200);
        toastTimers.current.add(timer);
      }

      // Record in My Bets History
      const record: UserBetRecord = {
        id: `rec-${Date.now()}-${panelId}`,
        roundId: roundIdRef.current,
        panelId,
        betAmount: targetPanel.stake,
        cashedOutAt: cashoutMult,
        crashPoint: currentRoundTargetRef.current.crashPoint,
        profit,
        won: true,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      setUserBetHistory((prev) => [record, ...prev.slice(0, 49)]);
    },
    [updatePanelState]
  );

  const handleManualCashOut = useCallback(
    (panelId: 1 | 2) => {
      if (phase !== "IN_FLIGHT") return;
      executeCashOut(panelId, multiplier);
    },
    [phase, multiplier, executeCashOut]
  );

  // MASTER GAME STATE MACHINE LOOP
  useEffect(() => {
    let disposed = false;
    let stopLoop = () => {};

    if (phase === "BETTING") {
      const durationMs = 5000;
      const startTs = performance.now() - (Date.now() - phaseStarted.current);
      let lastSecondBeep = 4;

      const tickCountdown = (now: number) => {
        const elapsed = now - startTs;
        const remaining = Math.max(0, (durationMs - elapsed) / 1000);
        setCountdown(remaining);

        const secCeil = Math.ceil(remaining);
        if (secCeil <= 3 && secCeil > 0 && secCeil < lastSecondBeep) {
          lastSecondBeep = secCeil;
          soundEngine.playTick(secCeil === 1);
        }

        if (remaining <= 0) {
          if (poolFor(1).busy || poolFor(2).busy) {
            return;
          }
          const p1 = panel1Ref.current;
          const p2 = panel2Ref.current;
          let activeUserTarget: number | undefined = undefined;
          if (p1.isBetPlaced && p1.autoCashoutEnabled) {
            activeUserTarget = p1.autoCashoutTarget;
          } else if (p2.isBetPlaced && p2.autoCashoutEnabled) {
            activeUserTarget = p2.autoCashoutTarget;
          }

          const outcome = crashDeckEngine.nextRoundOutcome(activeUserTarget);
          currentRoundTargetRef.current = outcome;
          setDismissalText(outcome.dismissalType);
          setMultiplier(1.0);

          soundEngine.playBatHit();
          soundEngine.startFlightSound();
          phaseRef.current = "IN_FLIGHT";
          phaseStarted.current = Date.now();
          saveMachine();
          setPhase("IN_FLIGHT");
          return false;
        }
      };

      stopLoop = visibleAnimationFrame(tickCountdown);
    } else if (phase === "IN_FLIGHT") {
      const flightStartTs = performance.now() - (Date.now() - phaseStarted.current);
      let targetCrash = currentRoundTargetRef.current.crashPoint;

      const tickFlight = (now: number) => {
        if (poolOne.busy || poolTwo.busy) {
          return;
        }
        const elapsedSec = (now - flightStartTs) / 1000;
        // Authentic Crash Cricket exponential trajectory curve
        const rawMult = Math.exp(0.085 * Math.pow(elapsedSec, 1.24));
        const nextMult = Number(rawMult.toFixed(2));
        for (const panelId of [1, 2] as const) {
          const panel = panelId === 1 ? panel1Ref.current : panel2Ref.current;
          if (panel.isBetPlaced && panel.cashedOutAt === null && panel.autoCashoutEnabled &&
            panel.autoCashoutTarget < targetCrash && nextMult >= panel.autoCashoutTarget) {
            void executeCashOut(panelId, panel.autoCashoutTarget);
          }
        }

        // Check if we reached the crash point
        if (nextMult >= targetCrash) {
          setMultiplier(targetCrash);
          soundEngine.playCrashWicket();
          phaseRef.current = "CRASHED";
          phaseStarted.current = Date.now();
          saveMachine();
          setPhase("CRASHED");
          return false;
        }

        setMultiplier(nextMult);
        soundEngine.updateFlightPitch(nextMult);

        // Check User Auto-Cashouts
        const p1 = panel1Ref.current;
        if (
          p1.isBetPlaced &&
          p1.cashedOutAt === null &&
          p1.autoCashoutEnabled &&
          nextMult >= p1.autoCashoutTarget
        ) {
          executeCashOut(1, p1.autoCashoutTarget);
        }

        const p2 = panel2Ref.current;
        if (
          p2.isBetPlaced &&
          p2.cashedOutAt === null &&
          p2.autoCashoutEnabled &&
          nextMult >= p2.autoCashoutTarget
        ) {
          executeCashOut(2, p2.autoCashoutTarget);
        }

        // Check Simulated Players Cashouts
        setLiveBets((prev) => {
          let changed = false;
          const updated = prev.map((bet) => {
            if (
              !bet.isUser &&
              bet.cashedOutAt === null &&
              nextMult >= bet.targetCashout
            ) {
              changed = true;
              return {
                ...bet,
                cashedOutAt: bet.targetCashout,
                winAmount: Number(
                  (bet.betAmount * bet.targetCashout).toFixed(2)
                ),
              };
            }
            return bet;
          });
          return changed ? updated : prev;
        });

        const entries = liveBetsRef.current;
        const cashed = entries.filter((bet) =>
          bet.cashedOutAt !== null || (!bet.isUser && nextMult >= bet.targetCashout)).length;
        if (nextMult < targetCrash && cashoutLimitReached(cashed, entries.length)) {
          targetCrash = Number((nextMult + 0.01).toFixed(2));
          currentRoundTargetRef.current = { ...currentRoundTargetRef.current, crashPoint: targetCrash };
          saveMachine();
        }

      };

      stopLoop = visibleAnimationFrame(tickFlight);
    } else if (phase === "CRASHED") {
      const crashedAt = currentRoundTargetRef.current.crashPoint;
      const bucket = currentRoundTargetRef.current.bucket;
      const dismissal = currentRoundTargetRef.current.dismissalType;
      const hash = currentRoundTargetRef.current.hash;

      // Record any un-cashed user bets as Losses in My Bets
      if (recordedLossRound.current !== roundIdRef.current) [1, 2].forEach((pid) => {
        const panelId = pid as 1 | 2;
        const pState = panelId === 1 ? panel1Ref.current : panel2Ref.current;
        if (pState.isBetPlaced && pState.cashedOutAt === null) {
          const lossRecord: UserBetRecord = {
            id: `loss-${Date.now()}-${panelId}`,
            roundId: roundIdRef.current,
            panelId,
            betAmount: pState.stake,
            cashedOutAt: null,
            crashPoint: crashedAt,
            profit: -pState.stake,
            won: false,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          };
          setUserBetHistory((prev) => [lossRecord, ...prev.slice(0, 49)]);
        }
      });
      recordedLossRound.current = roundIdRef.current;

      // Push round to Recent Crash History Ribbon
      const newHistoryItem: RoundHistoryItem = {
        id: roundIdRef.current,
        crashPoint: crashedAt,
        bucket,
        dismissalType: dismissal,
        hash,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      setRoundHistory((prev) => [newHistoryItem, ...prev.slice(0, 29)]);

      // Hold CRASHED screen for 3.2 seconds then start next round BETTING phase
      const nextRoundAt = performance.now() + 3200;
      const startNextRound = async () => {
        const nextRoundNum = roundIdRef.current + 1;
        setRoundId(nextRoundNum);
        setCountdown(5.0);
        setMultiplier(1.0);

        const freshSimBets = generateSimulatedBetsForRound();
        const userEntriesForNextRound: LiveBetEntry[] = [];

        // Close every previous-round obligation before accepting either next-round panel.
        for (const panelId of [1, 2] as const) {
          while (!disposed && poolFor(panelId).busy) await new Promise(resolve => setTimeout(resolve, 50));
          if (disposed) return;
          const previous = panelId === 1 ? panel1Ref.current : panel2Ref.current;
          if (previous.isBetPlaced && previous.cashedOutAt === null) {
            saveMachine({ [panelId === 1 ? "panel1" : "panel2"]: { ...previous, isBetPlaced: false } });
            if (!await poolFor(panelId).complete(0)) return;
            if (disposed) return;
            updatePanelState(panelId, panel => ({ ...panel, isBetPlaced: false }));
          }
        }
        phaseRef.current = "BETTING";
        phaseStarted.current = Date.now();

        // Process Panel 1 & Panel 2 Queued or Auto-Bets for the new round
        for (const pid of [1, 2]) {
          const panelId = pid as 1 | 2;
          while (!disposed && poolFor(panelId).busy) await new Promise(resolve => setTimeout(resolve, 50));
          if (disposed) return;
          const current = panelId === 1 ? panel1Ref.current : panel2Ref.current;
          const queued = queuedPanels.current[panelId];
          delete queuedPanels.current[panelId];
          const pRef = queued ?? current;
          const shouldPlace = Boolean(queued) || current.autoBet;

          if (shouldPlace && Number.isFinite(pRef.stake) && pRef.stake > 0 && balanceRef.current >= pRef.stake) {
            const nextPanel = { ...pRef, isBetPlaced: true, isBetQueued: false, cashedOutAt: null, winAmount: null };
            phaseStarted.current = Date.now();
            poolFor(panelId).checkpoint({
              machine: {
                phase: "BETTING", started: phaseStarted.current, roundId: nextRoundNum, target: currentRoundTargetRef.current,
                panel1: panelId === 1 ? nextPanel : panel1Ref.current, panel2: panelId === 2 ? nextPanel : panel2Ref.current,
              }
            });
            if (!await poolFor(panelId).start(pRef.stake)) return;
            if (disposed) return;

            updatePanelState(panelId, (prev) => ({
              ...prev,
              stake: pRef.stake,
              autoCashoutEnabled: pRef.autoCashoutEnabled,
              autoCashoutTarget: pRef.autoCashoutTarget,
              isBetPlaced: true,
              isBetQueued: false,
              cashedOutAt: null,
              winAmount: null,
              status: "Bet accepted for this round",
            }));

            userEntriesForNextRound.push({
              id: `user-p${panelId}`,
              username: `YOU (Bet #${panelId})`,
              avatarColor: panelId === 1 ? "#00E701" : "#38BDF8",
              isUser: true,
              panelId,
              betAmount: pRef.stake,
              targetCashout: pRef.autoCashoutTarget,
              cashedOutAt: null,
              winAmount: null,
            });
          } else {
            updatePanelState(panelId, (prev) => ({
              ...prev,
              isBetPlaced: false,
              isBetQueued: false,
              cashedOutAt: null,
              winAmount: null,
              status: shouldPlace ? "Bet rejected — invalid stake or insufficient balance" : "",
            }));
          }
        }

        setLiveBets([...userEntriesForNextRound, ...freshSimBets]);
        phaseRef.current = "BETTING";
        phaseStarted.current = Date.now();
        saveMachine();
        setPhase("BETTING");
      };
      stopLoop = visibleAnimationFrame(now => {
        if (now < nextRoundAt) return;
        void startNextRound();
        return false;
      });
    }

    return () => {
      disposed = true;
      stopLoop();
    };
  }, [phase, executeCashOut, updatePanelState]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  };

  return (
    <div className="crash-cricket-wrap h-full w-full flex flex-col justify-between overflow-hidden bg-[#070B14] text-[#F8FAFC] px-1.5 sm:px-3 py-1">
      {/* 1. TOP BROADCAST HEADER BAR (42px) */}
      <header className="h-10 sm:h-11 px-2 sm:px-3 bg-[#0B111E] border-b border-[#1E2D4A] flex items-center justify-between gap-2 shrink-0 z-30 rounded-xl">
        {/* Left: Crash Cricket Brand Emblem + 35/65 RNG Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-[#FFFFFF] via-[#38BDF8] to-[#00E701] p-0.5 shadow-[0_0_15px_rgba(56,189,248,0.4)] flex items-center justify-center">
              <div className="w-full h-full bg-[#070B14] rounded-[6px] flex items-center justify-center p-0.5">
                <svg viewBox="0 0 64 64" className="w-full h-full">
                  <defs>
                    <radialGradient id="hdrWhiteBall" cx="32%" cy="30%" r="70%">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="45%" stopColor="#F8FAFC" />
                      <stop offset="78%" stopColor="#CBD5E1" />
                      <stop offset="100%" stopColor="#334155" />
                    </radialGradient>
                    <linearGradient id="hdrCrimsonPanel" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#DC2626" stopOpacity="0.9" />
                      <stop offset="45%" stopColor="#B91C1C" stopOpacity="0.75" />
                      <stop offset="52%" stopColor="#FFFFFF" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <circle cx="32" cy="32" r="28" fill="url(#hdrWhiteBall)" />
                  <circle cx="32" cy="32" r="28" fill="url(#hdrCrimsonPanel)" />
                  <ellipse
                    cx="32"
                    cy="32"
                    rx="27"
                    ry="11"
                    transform="rotate(-22 32 32)"
                    fill="none"
                    stroke="#991B1B"
                    strokeWidth="6"
                  />
                  <ellipse
                    cx="32"
                    cy="30"
                    rx="26"
                    ry="10"
                    transform="rotate(-22 32 32)"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    strokeDasharray="3.5 2.5"
                  />
                  <ellipse
                    cx="32"
                    cy="34"
                    rx="26"
                    ry="10"
                    transform="rotate(-22 32 32)"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    strokeDasharray="3.5 2.5"
                  />
                </svg>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-display font-extrabold text-base sm:text-lg tracking-wider text-[#F8FAFC]">
                  CRASH
                </span>
                <span className="font-display font-extrabold text-base sm:text-lg tracking-wider text-[#00E701]">
                  CRICKET
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#FFB800]/20 border border-[#FFB800]/50 text-[#FFB800] font-mono-tabular font-bold text-[9px]">
                  PRO X
                </span>
              </div>
              <span className="text-[9px] text-[#94A3B8] font-mono-tabular hidden sm:inline">
                OFFICIAL TURBO STADIUM EDITION
              </span>
            </div>
          </div>

          {/* Live Engine Status Pill */}
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#131C2E] border border-[#1E2D4A] text-[11px] font-mono-tabular"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#00E701]" />
            <span className="text-[#00E701] font-bold">LIVE STADIUM ENGINE</span>
          </div>
        </div>

        {/* Right: Wallet Balance Pill, Top-Up, Rules & Audio Controls */}
        <div className="flex items-center gap-2">
          {/* Wallet Balance Pill */}
          <div className="flex items-center gap-2 bg-[#131C2E] border border-[#1E2D4A] rounded-full pl-3 pr-1.5 py-1">
            <Wallet className="w-3.5 h-3.5 text-[#00E701]" />
            <div className="flex items-baseline gap-1 font-mono-tabular">
              <span className="text-[11px] text-[#94A3B8] font-semibold">
                Rs.
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-[#00E701]">
                {balance.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          {/* How to Play / Rules Button */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setShowRulesModal(true);
            }}
            className="p-2 rounded-lg bg-[#131C2E] hover:bg-[#1E2D4A] border border-[#1E2D4A] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
            title="How to Play"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* RNG / Provably Fair Button */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setShowFairModal(true);
            }}
            className="p-2 rounded-lg bg-[#131C2E] hover:bg-[#1E2D4A] border border-[#1E2D4A] text-[#00E701] transition-colors cursor-pointer"
            title="RNG Engine Settings"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>

          {/* Audio Mute/Unmute Toggle */}
          <button
            type="button"
            onClick={toggleMute}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${isMuted
              ? "bg-[#FF2A4B]/15 border-[#FF2A4B]/40 text-[#FF2A4B]"
              : "bg-[#131C2E] hover:bg-[#1E2D4A] border-[#1E2D4A] text-[#38BDF8]"
              }`}
            title={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE (Left Live Bets Sidebar + Right Stadium & Dual Bet Panels) */}
      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto p-1 sm:p-2 flex flex-col lg:flex-row gap-2 overflow-hidden">
        {/* LEFT SIDEBAR: All Bets | My Bets | Top Wins (Hidden on mobile to fit screen) */}
        <div className="hidden lg:flex flex-col w-[300px] shrink-0 h-full overflow-hidden">
          <LiveBetsSidebar
            phase={phase}
            liveBets={liveBets}
            userBetHistory={userBetHistory}
            roundHistory={roundHistory}
          />
        </div>

        {/* RIGHT MAIN GAME AREA */}
        <div className="flex-1 flex flex-col gap-1.5 sm:gap-2 min-w-0 overflow-hidden">
          {/* RECENT CRASH HISTORY RIBBON (32px) */}
          <div className="relative bg-[#0B111E] border border-[#1E2D4A] rounded-xl px-2 py-1 flex items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1">
              {roundHistory.slice(0, 18).map((item, idx) => {
                const isHigh = item.crashPoint >= 10;
                const isMid = item.crashPoint >= 2 && item.crashPoint < 10;

                return (
                  <button
                    key={`${item.id}-${idx}`}
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setShowHistoryDrawer((prev) => !prev);
                    }}
                    className={`px-2.5 py-0.5 rounded-full font-mono-tabular font-bold text-xs shrink-0 border transition-transform hover:scale-105 cursor-pointer ${idx === 0 ? "ring-2 ring-white/30" : ""
                      } ${isHigh
                        ? "bg-[#FFB800]/20 border-[#FFB800] text-[#FFB800] shadow-[0_0_10px_rgba(255,184,0,0.35)]"
                        : isMid
                          ? "bg-[#00E701]/15 border-[#00E701]/60 text-[#00E701]"
                          : "bg-[#38BDF8]/15 border-[#38BDF8]/50 text-[#38BDF8]"
                      }`}
                    title={`Over #${item.id} — ${item.crashPoint.toFixed(2)}x`}
                  >
                    {item.crashPoint.toFixed(2)}x
                  </button>
                );
              })}
            </div>

            {/* Expand Round History Button */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setShowHistoryDrawer((prev) => !prev);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#131C2E] hover:bg-[#1E2D4A] border border-[#1E2D4A] text-xs font-display font-bold uppercase tracking-wider text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span className="hidden sm:inline">History</span>
              {showHistoryDrawer ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Dropdown Expanded History Overlay */}
            {showHistoryDrawer && (
              <div className="absolute top-full left-0 right-0 mt-1.5 p-3 rounded-xl bg-[#0B111E]/95 border border-[#1E2D4A] backdrop-blur-xl shadow-2xl z-30">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-[#1E2D4A]">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-xs uppercase tracking-wider text-[#F8FAFC]">
                      RECENT 20 OVERS TELEMETRY
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHistoryDrawer(false)}
                    className="text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-1.5">
                  {roundHistory.slice(0, 20).map((r) => (
                    <div
                      key={r.id}
                      className={`p-1.5 rounded-lg border text-center flex flex-col items-center ${r.crashPoint >= 10
                        ? "bg-[#FFB800]/15 border-[#FFB800]/50 text-[#FFB800]"
                        : r.crashPoint >= 2
                          ? "bg-[#00E701]/15 border-[#00E701]/40 text-[#00E701]"
                          : "bg-[#38BDF8]/10 border-[#38BDF8]/30 text-[#38BDF8]"
                        }`}
                    >
                      <span className="text-[9px] text-[#94A3B8] font-mono-tabular">
                        #{r.id}
                      </span>
                      <span className="font-mono-tabular font-extrabold text-xs">
                        {r.crashPoint.toFixed(2)}x
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* INTERACTIVE 60FPS CRICKET STADIUM FLIGHT CANVAS */}
          <CricketFlightCanvas
            phase={phase}
            multiplier={multiplier}
            countdown={countdown}
            dismissalText={dismissalText}
            cashoutToasts={cashoutToasts}
            roundId={roundId}
          />

          {/* DUAL BET CONTROLLERS (Panel 1 & Panel 2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <BetControlPanel
              panelId={1}
              phase={phase}
              currentMultiplier={multiplier}
              balance={balance}
              state={panel1}
              onUpdateState={updatePanelState}
              onPlaceOrQueueBet={handlePlaceOrQueueBet}
              onCancelBet={handleCancelBet}
              onCashOut={handleManualCashOut}
            />

            <BetControlPanel
              panelId={2}
              phase={phase}
              currentMultiplier={multiplier}
              balance={balance}
              state={panel2}
              onUpdateState={updatePanelState}
              onPlaceOrQueueBet={handlePlaceOrQueueBet}
              onCancelBet={handleCancelBet}
              onCashOut={handleManualCashOut}
            />
          </div>
        </div>
      </main>

      {/* MODAL 2: HOW TO PLAY CRASH CRICKET */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B111E] border border-[#1E2D4A] rounded-2xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2D4A]">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#38BDF8]" />
                <h3 className="font-display font-bold text-lg uppercase tracking-wider text-[#F8FAFC]">
                  How To Play Crash Cricket
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-[#94A3B8] leading-relaxed">
              <div className="p-3 rounded-xl bg-[#131C2E] border border-[#1E2D4A]">
                <strong className="text-[#00E701] font-display uppercase text-sm block mb-1">
                  1. Place Your Bets Before Delivery
                </strong>
                Use Panel #1, Panel #2, or both simultaneously! Choose your stake
                with the quick chips (50, 100, 200, 500, 1000) or a custom amount and click{" "}
                <strong className="text-[#F8FAFC]">BET</strong> before the 5-second
                bowler run-up timer reaches 0.0s.
              </div>

              <div className="p-3 rounded-xl bg-[#131C2E] border border-[#1E2D4A]">
                <strong className="text-[#38BDF8] font-display uppercase text-sm block mb-1">
                  2. Watch The Cricket Ball Soar
                </strong>
                Once the batsman strikes the ball, the multiplier starts at{" "}
                <strong className="text-[#F8FAFC]">1.00x</strong> and climbs higher
                as the ball travels across the night stadium sky.
              </div>

              <div className="p-3 rounded-xl bg-[#131C2E] border border-[#1E2D4A]">
                <strong className="text-[#FFB800] font-display uppercase text-sm block mb-1">
                  3. Cash Out Before The Wicket / Catch!
                </strong>
                Click <strong className="text-[#FFB800]">CASH OUT</strong> at any
                moment to lock in your stake multiplied by the current multiplier!
                If the ball crashes (Bowled, Caught Out, or Ball Burst) before you
                cash out, your bet for that delivery is lost.
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="px-5 py-2 rounded-lg bg-[#38BDF8] text-[#070B14] font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                Start Playing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
