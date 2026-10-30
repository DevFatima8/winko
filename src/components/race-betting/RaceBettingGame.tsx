'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGameBalance, usePoolLifecycle, usePoolRoundState } from "@/lib/walletSync";
import { QueuedWager, useRoundQueue } from "../blast-off/useRoundQueue";
import { BET_PRESETS } from "@/lib/betPresets";
import confetti from 'canvas-confetti';
import {
  Bet,
  BetType,
  Card,
  GamePhase,
  GameStats,
  RoundResult,
  SettledBet,
  Suit,
} from './types';
import {
  generateControlledRound,
  generateRaceSequence,
  generateRoundId,
  settleBets,
} from './engine';
import { soundManager } from './audio';
import { CasinoHeader } from './components/CasinoHeader';
import { RaceTrackStudio } from './components/RaceTrackStudio';
import { OddsBoard } from './components/OddsBoard';
import { ChipsAndControls } from './components/ChipsAndControls';
import { RecentResultsBar } from './components/RecentResultsBar';
import { ActiveBetsPanel } from './components/ActiveBetsPanel';
import { RulesModal } from './components/RulesModal';
import { SettingsModal } from './components/SettingsModal';
import { RoundDetailModal } from './components/BetDetailModal';

const BETTING_DURATION = 15;
const INITIAL_BALANCE = 0;

export default function Race20GamePage() {
  // Game Flow State
  const [phase, setPhase] = useState<GamePhase>('BETTING');
  const [countdown, setCountdown] = useState<number>(BETTING_DURATION);
  const [roundId, setRoundId] = useState<string>('');
  const [turboMode, setTurboMode] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const winRatio = 0.35;

  // Studio Table Display State
  const [suitCards, setSuitCards] = useState<Record<Suit, Card[]>>({
    SPADE: [],
    HEART: [],
    CLUB: [],
    DIAMOND: [],
  });
  const [currentDrawnCards, setCurrentDrawnCards] = useState<Card[]>([]);
  const [currentDrawnCard, setCurrentDrawnCard] = useState<Card | null>(null);
  const [winningSuit, setWinningSuit] = useState<Suit | null>(null);
  const [totalCards, setTotalCards] = useState<number>(0);
  const [totalPoints, setTotalPoints] = useState<number>(0);

  // Player Financial & Betting State
  const [balance, setBalance] = useGameBalance("race-betting", INITIAL_BALANCE);
  const pool = usePoolLifecycle("race-betting");
  const [selectedChip, setSelectedChip] = useState<number>(BET_PRESETS[0]);
  const [activeBets, setActiveBets] = usePoolRoundState<Bet[]>("race-betting", "activeBets", []);
  const [lastRoundBets, setLastRoundBets] = useState<Bet[]>([]);
  const [settledBets, setSettledBets] = useState<SettledBet[]>([]);
  const [netProfitToday, setNetProfitToday] = useState<number>(0);

  // History & Statistics
  const [history, setHistory] = useState<RoundResult[]>([]);
  const [stats, setStats] = useState<GameStats>({
    totalRounds: 0,
    playerRounds: 0,
    playerWins: 0,
    playerLosses: 0,
    totalWonAmount: 0,
    totalLostAmount: 0,
    suitCounts: { SPADE: 0, HEART: 0, CLUB: 0, DIAMOND: 0 },
  });

  // Modals
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [selectedHistoryRound, setSelectedHistoryRound] = useState<RoundResult | null>(null);

  // Planned deal sequence for the current round
  const plannedRoundRef = useRef<ReturnType<typeof generateRaceSequence> | null>(null);
  const dealIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeBetsRef = useRef(activeBets);
  const balanceRef = useRef(balance);
  const roundIdRef = useRef(roundId);
  const phaseRef = useRef(phase);
  const settledRef = useRef(false);
  const flowRef = useRef({ close: () => { }, deal: () => { }, finish: (_winner: Suit) => { }, next: () => { } });
  const queue = useRoundQueue<Bet>();
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);
  const commitBets = (next: Bet[]) => {
    activeBetsRef.current = next;
    setActiveBets(next);
  };
  useEffect(() => () => {
    if (dealIntervalRef.current) clearInterval(dealIntervalRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
  }, []);

  // Initialize game on mount
  useEffect(() => {
    setRoundId(generateRoundId());
    setIsMuted(soundManager.getMuted());

    // Load stored balance if available
    try {
      const savedStats = localStorage.getItem('race20_stats');
      if (savedStats) setStats(JSON.parse(savedStats));

      const savedTurbo = localStorage.getItem('race20_turbo');
      if (savedTurbo) setTurboMode(savedTurbo === 'true');
    } catch {
      // ignore
    }

    // Seed mock initial historical rounds for instant rich display
    const mockHistory: RoundResult[] = [];
    for (let i = 0; i < 8; i++) {
      const generated = generateRaceSequence();
      mockHistory.push({
        roundId: generateRoundId(),
        winningSuit: generated.winningSuit,
        totalCards: generated.totalCards,
        totalPoints: generated.totalPoints,
        cardsSequence: generated.cards,
        suitCards: generated.suitCards,
        timestamp: Date.now() - (8 - i) * 60000,
      });
    }
    setHistory(mockHistory);
  }, []);

  // Save balance on change
  useEffect(() => {
    try {
      localStorage.setItem('race20_balance', String(balance));
    } catch {
      // ignore
    }
  }, [balance]);

  // Save stats on change
  useEffect(() => {
    try {
      localStorage.setItem('race20_stats', JSON.stringify(stats));
    } catch {
      // ignore
    }
  }, [stats]);

  // Main Timer Loop for BETTING phase
  useEffect(() => {
    if (phase !== 'BETTING') return;

    let remaining = BETTING_DURATION;
    const timer = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        flowRef.current.close();
        return;
      }
      if (remaining < 5) {
        soundManager.playTick(true);
      } else if (remaining === 9) {
        soundManager.playTick(false);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Trigger BETS CLOSED -> DEALING
  const triggerBetsClosed = useCallback(() => {
    if (pool.busy) return;
    if (phaseRef.current !== 'BETTING') return;
    phaseRef.current = 'CLOSED';
    setPhase('CLOSED');
    soundManager.playBetsClosed();

    const planned = generateControlledRound(activeBetsRef.current, winRatio);
    if (activeBetsRef.current.length) {
      const result: RoundResult = {
        roundId: roundIdRef.current, winningSuit: planned.winningSuit,
        totalCards: planned.totalCards, totalPoints: planned.totalPoints,
        cardsSequence: planned.cards, suitCards: planned.suitCards, timestamp: Date.now(),
      };
      pool.plan(settleBets(activeBetsRef.current, result).totalPayout, planned);
    }
    plannedRoundRef.current = planned;

    // Small delay before cards start dealing
    closeTimerRef.current = setTimeout(() => {
      flowRef.current.deal();
    }, 1500);
  }, [activeBets, winRatio]);

  // Deal cards one-by-one from the shoe
  const startDealingCards = useCallback(() => {
    if (!plannedRoundRef.current) return;

    setPhase('DEALING');
    phaseRef.current = 'DEALING';
    const fullSequence = plannedRoundRef.current.cards;
    const finalWinner = plannedRoundRef.current.winningSuit;
    let cardIdx = 0;

    const stepMs = turboMode ? 400 : 950;

    dealIntervalRef.current = setInterval(() => {
      if (cardIdx >= fullSequence.length) {
        if (dealIntervalRef.current) clearInterval(dealIntervalRef.current);
        flowRef.current.finish(finalWinner);
        return;
      }

      const nextCard = fullSequence[cardIdx];
      soundManager.playCardFlip();

      setCurrentDrawnCard(nextCard);
      setCurrentDrawnCards((prev) => [...prev, nextCard]);
      setTotalCards((prev) => prev + 1);
      setTotalPoints((prev) => prev + nextCard.value);

      setSuitCards((prev) => ({
        ...prev,
        [nextCard.suit]: [...prev[nextCard.suit], nextCard],
      }));

      cardIdx++;
    }, stepMs);
  }, [turboMode]);

  // Round completion, settling bets, victory celebrations
  const finishRound = useCallback(
    async (winnerSuit: Suit) => {
      if (settledRef.current) return;
      settledRef.current = true;
      const activeBets = activeBetsRef.current;
      setWinningSuit(winnerSuit);
      setPhase('RESULT');
      phaseRef.current = 'RESULT';

      const currentRoundResult: RoundResult = {
        roundId: roundIdRef.current,
        winningSuit: winnerSuit,
        totalCards: plannedRoundRef.current?.totalCards || totalCards,
        totalPoints: plannedRoundRef.current?.totalPoints || totalPoints,
        cardsSequence: plannedRoundRef.current?.cards || [],
        suitCards: plannedRoundRef.current?.suitCards || suitCards,
        timestamp: Date.now(),
      };

      // Settle active bets
      if (activeBets.length > 0) {
        const { settled, totalPayout, netProfit } = settleBets(activeBets, currentRoundResult);
        setSettledBets(settled);
        setLastRoundBets(activeBets);

        // Update balance
        if (!await pool.complete(totalPayout)) { settledRef.current = false; return; }
        setNetProfitToday((prev) => prev + netProfit);

        // Update stats
        const isPlayerRoundWon = netProfit > 0;
        setStats((prev) => ({
          ...prev,
          totalRounds: prev.totalRounds + 1,
          playerRounds: prev.playerRounds + 1,
          playerWins: isPlayerRoundWon ? prev.playerWins + 1 : prev.playerWins,
          playerLosses: !isPlayerRoundWon ? prev.playerLosses + 1 : prev.playerLosses,
          totalWonAmount: isPlayerRoundWon ? prev.totalWonAmount + netProfit : prev.totalWonAmount,
          totalLostAmount: !isPlayerRoundWon ? prev.totalLostAmount + Math.abs(netProfit) : prev.totalLostAmount,
          suitCounts: {
            ...prev.suitCounts,
            [winnerSuit]: (prev.suitCounts[winnerSuit] || 0) + 1,
          },
        }));

        if (isPlayerRoundWon) {
          soundManager.playWin();
          confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#fbbf24', '#f59e0b', '#10b981', '#3b82f6', '#ec4899'],
          });
        } else {
          soundManager.playLoss();
        }
      } else {
        // No player bets this round
        setSettledBets([]);
        setStats((prev) => ({
          ...prev,
          totalRounds: prev.totalRounds + 1,
          suitCounts: {
            ...prev.suitCounts,
            [winnerSuit]: (prev.suitCounts[winnerSuit] || 0) + 1,
          },
        }));
      }

      // Add to history
      setHistory((prev) => [currentRoundResult, ...prev.slice(0, 24)]);

      // Reset and start next round after 5 seconds
      nextTimerRef.current = setTimeout(() => {
        flowRef.current.next();
      }, 5000);
    },
    [roundId, activeBets, totalCards, totalPoints, suitCards]
  );

  // Start next round
  const startNextRound = useCallback(async () => {
    settledRef.current = false;
    setRoundId(generateRoundId());
    setPhase('BETTING');
    phaseRef.current = 'BETTING';
    setCountdown(BETTING_DURATION);
    setWinningSuit(null);
    setCurrentDrawnCard(null);
    setCurrentDrawnCards([]);
    setTotalCards(0);
    setTotalPoints(0);
    commitBets([]);
    const queued = queue.consume();
    if (queued) {
      const cost = queued.isLay ? queued.stake * (queued.odds - 1) : queued.stake;
      if (Number.isFinite(cost) && cost > 0 && cost <= balanceRef.current) {
        pool.checkpoint({ activeBets: [queued] });
        if (!await pool.start(cost)) return;
        commitBets([queued]);
        queue.setStatus("Bet accepted for this round");
      } else queue.setStatus("Queued bet rejected — invalid stake or insufficient balance");
    }
    setSuitCards({
      SPADE: [],
      HEART: [],
      CLUB: [],
      DIAMOND: [],
    });
    plannedRoundRef.current = null;
  }, []);
  useEffect(() => {
    flowRef.current = { close: triggerBetsClosed, deal: startDealingCards, finish: finishRound, next: startNextRound };
  });

  // Player places a bet
  const handlePlaceBet = async (
    type: BetType,
    label: string,
    odds: number,
    target?: Suit,
    isLay: boolean = false
  ) => {
    if (!Number.isFinite(selectedChip) || selectedChip < 1 || !Number.isFinite(odds) || odds <= 1) return;

    const stake = selectedChip;
    const requiredAmount = isLay ? stake * (odds - 1) : stake;

    if (balanceRef.current < requiredAmount) {
      alert(`Insufficient balance! You need Rs. ${requiredAmount.toLocaleString()} to place this bet.`);
      return;
    }

    soundManager.playChip();
    if (phaseRef.current !== 'BETTING') {
      queue.enqueue({
        id: `queued_${Date.now()}`, type, target, targetLabel: label, odds, stake,
        potentialProfit: isLay ? stake : stake * (odds - 1),
        liability: isLay ? requiredAmount : undefined, isLay,
      });
      return;
    }

    const potentialProfit = isLay ? stake : stake * (odds - 1);

    const nextBets = (() => {
      const prev = activeBetsRef.current;
      // Check if bet of exact same type, target, and lay already exists
      const existingIdx = prev.findIndex(
        (b) => b.type === type && b.target === target && Boolean(b.isLay) === Boolean(isLay)
      );

      if (existingIdx !== -1) {
        const updated = [...prev];
        const existing = updated[existingIdx];
        const newStake = existing.stake + stake;
        const newProfit = isLay ? newStake : newStake * (odds - 1);
        updated[existingIdx] = {
          ...existing,
          stake: newStake,
          potentialProfit: newProfit,
          liability: isLay ? newStake * (odds - 1) : undefined,
        };
        return updated;
      }

      const newBet: Bet = {
        id: `bet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type,
        target,
        targetLabel: label,
        odds,
        stake,
        potentialProfit,
        liability: isLay ? stake * (odds - 1) : undefined,
        isLay,
      };

      return [...prev, newBet];
    })();
    pool.checkpoint({ activeBets: nextBets });
    if (!await pool.stake(requiredAmount)) return;
    commitBets(nextBets);
  };

  // Remove a specific active bet
  const handleRemoveBet = async (id: string) => {
    if (phaseRef.current !== 'BETTING') return;
    const betToRemove = activeBetsRef.current.find((b) => b.id === id);
    if (!betToRemove) return;

    const refund = betToRemove.isLay ? betToRemove.stake * (betToRemove.odds - 1) : betToRemove.stake;
    pool.checkpoint({ activeBets: activeBetsRef.current.filter((b) => b.id !== id) });
    if (!await pool.reduce(refund)) return;
    commitBets(activeBetsRef.current.filter((b) => b.id !== id));
    soundManager.playChip();
  };

  // Clear all active bets
  const handleClearBets = async () => {
    if (phaseRef.current !== 'BETTING' || activeBetsRef.current.length === 0) return;
    if (!await pool.refund()) return;
    commitBets([]);
    soundManager.playChip();
  };

  // Double active bets (2X)
  const handleDoubleBets = async () => {
    if (phaseRef.current !== 'BETTING' || activeBetsRef.current.length === 0) return;
    const additionalCost = activeBetsRef.current.reduce(
      (sum, b) => sum + (b.isLay ? b.stake * (b.odds - 1) : b.stake),
      0
    );

    if (balanceRef.current < additionalCost) {
      alert('Insufficient balance to double bets!');
      return;
    }

    const nextBets = activeBetsRef.current.map((b) => ({
      ...b,
      stake: b.stake * 2,
      potentialProfit: b.potentialProfit * 2,
      liability: b.liability ? b.liability * 2 : undefined,
    }));
    pool.checkpoint({ activeBets: nextBets });
    if (!await pool.stake(additionalCost)) return;
    commitBets(nextBets);
    soundManager.playChip();
  };

  // Repeat previous round bets
  const handleRepeatBets = async () => {
    if (phaseRef.current !== 'BETTING' || lastRoundBets.length === 0) return;
    const totalCost = lastRoundBets.reduce(
      (sum, b) => sum + (b.isLay ? b.stake * (b.odds - 1) : b.stake),
      0
    );

    if (balanceRef.current < totalCost) {
      alert('Insufficient balance to repeat previous bets!');
      return;
    }

    // Clear current bets first if any
    await handleClearBets();
    if (activeBetsRef.current.length) return;

    const nextBets = lastRoundBets.map((b) => ({ ...b, id: `bet_${Date.now()}_${Math.random()}` }));
    pool.checkpoint({ activeBets: nextBets });
    if (!await pool.stake(totalCost)) return;
    commitBets(nextBets);
    soundManager.playChip();
  };

  // Sound mute toggle
  const handleToggleMute = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  // Turbo deal toggle
  const handleToggleTurbo = () => {
    setTurboMode((prev) => {
      const next = !prev;
      localStorage.setItem('race20_turbo', String(next));
      return next;
    });
  };

  // Reset stats
  const handleResetStats = () => {
    const emptyStats: GameStats = {
      totalRounds: 0,
      playerRounds: 0,
      playerWins: 0,
      playerLosses: 0,
      totalWonAmount: 0,
      totalLostAmount: 0,
      suitCounts: { SPADE: 0, HEART: 0, CLUB: 0, DIAMOND: 0 },
    };
    setStats(emptyStats);
    localStorage.setItem('race20_stats', JSON.stringify(emptyStats));
  };

  // Calculate current total stake & liability
  const totalStake = activeBets.reduce((sum, b) => sum + b.stake, 0);
  const totalLiability = activeBets.reduce(
    (sum, b) => sum + (b.isLay ? b.stake * (b.odds - 1) : 0),
    0
  );
  const maxPotentialProfit = activeBets.reduce((sum, b) => sum + b.potentialProfit, 0);

  const [mobileTab, setMobileTab] = useState<'odds' | 'bets'>('odds');

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100 flex flex-col font-sans overflow-y-auto overflow-x-hidden px-1 sm:px-2 md:px-3 py-0.5 select-none">
      {/* Top Header */}
      <CasinoHeader
        balance={balance}
        liability={totalLiability}
        netProfit={netProfitToday}
        isMuted={isMuted}
        winRatio={winRatio}
        onToggleMute={handleToggleMute}
        onOpenRules={() => setIsRulesOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Body */}
      <main className="max-w-7xl w-full mx-auto flex flex-col gap-1 py-0.5 pb-4">
        {/* Recent Results Ribbon */}
        <div className="shrink-0">
          <RecentResultsBar
            history={history}
            onSelectRound={(round) => setSelectedHistoryRound(round)}
          />
        </div>

        {/* Live Dealer Studio / 4 Kings Race Arena */}
        <div className="shrink-0">
          <RaceTrackStudio
            phase={phase}
            countdown={countdown}
            maxCountdown={BETTING_DURATION}
            roundId={roundId}
            suitCards={suitCards}
            currentDrawnCards={currentDrawnCards}
            currentDrawnCard={currentDrawnCard}
            winningSuit={winningSuit}
            totalCards={totalCards}
            totalPoints={totalPoints}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            turboMode={turboMode}
          />
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden items-center justify-center gap-2 shrink-0 py-0.5">
          <button
            onClick={() => setMobileTab('odds')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${mobileTab === 'odds'
              ? 'bg-gradient-to-r from-sky-500/30 to-blue-500/30 text-sky-300 border-sky-400/50 shadow-sm'
              : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
          >
            Odds Board
          </button>
          <button
            onClick={() => setMobileTab('bets')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${mobileTab === 'bets'
              ? 'bg-gradient-to-r from-amber-500/30 to-yellow-500/30 text-amber-300 border-amber-400/50 shadow-sm'
              : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
          >
            My Bets ({activeBets.length})
          </button>
        </div>

        {/* Main Odds & Bets Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          {/* Betting Exchange Board */}
          <div className={`lg:col-span-8 flex flex-col ${mobileTab === 'bets' ? 'hidden lg:flex' : 'flex'}`}>
            <OddsBoard
              phase={phase}
              activeBets={activeBets}
              selectedChip={selectedChip}
              onPlaceBet={handlePlaceBet}
            />
            <QueuedWager {...queue} />
          </div>

          {/* Active Bets & Settled Bets Panel */}
          <div className={`lg:col-span-4 flex flex-col space-y-2 ${mobileTab === 'odds' ? 'hidden lg:flex' : 'flex'}`}>
            <ActiveBetsPanel
              activeBets={activeBets}
              settledBets={settledBets}
              onRemoveBet={handleRemoveBet}
              canRemove={phase === 'BETTING'}
            />

            {/* Quick Casino Exchange Info Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-400 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between text-slate-200 font-bold border-b border-slate-800 pb-1.5">
                <span className="text-[11px]">RACE 20-20 RULES SUMMARY</span>
                <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded">
                  48 Cards
                </span>
              </div>
              <ul className="space-y-0.5 list-disc list-inside text-slate-300 text-[10px]">
                <li>First King to reach 5 cards wins!</li>
                <li>Points: Ace=1, 2-10=face, Jack=11, Queen=12.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Chips & Quick Controls Bar */}
        <div className="shrink-0">
          <ChipsAndControls
            phase={phase}
            selectedChip={selectedChip}
            onSelectChip={(val) => {
              setSelectedChip(val);
              soundManager.playChip();
            }}
            totalStake={totalStake}
            potentialProfit={maxPotentialProfit}
            onClearBets={handleClearBets}
            onDoubleBets={handleDoubleBets}
            onRepeatBets={handleRepeatBets}
            canRepeat={lastRoundBets.length > 0}
            canDouble={activeBets.length > 0}
          />
        </div>
      </main>

      {/* Modals */}
      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        turboMode={turboMode}
        onToggleTurbo={handleToggleTurbo}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onResetStats={handleResetStats}
      />
      <RoundDetailModal
        round={selectedHistoryRound}
        onClose={() => setSelectedHistoryRound(null)}
      />
    </div>
  );
}
