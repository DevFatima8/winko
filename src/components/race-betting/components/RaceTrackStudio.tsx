'use client';

import React from 'react';
import { Card, GamePhase, Suit } from '../types';
import { PlayingCard, getSuitSymbol } from './PlayingCard';
import { Crown, Sparkles, Volume2, VolumeX, ShieldCheck, Flame, RefreshCw } from 'lucide-react';

interface RaceTrackStudioProps {
  phase: GamePhase;
  countdown: number;
  maxCountdown: number;
  roundId: string;
  suitCards: Record<Suit, Card[]>;
  currentDrawnCards: Card[];
  currentDrawnCard: Card | null;
  winningSuit: Suit | null;
  totalCards: number;
  totalPoints: number;
  isMuted: boolean;
  onToggleMute: () => void;
  turboMode: boolean;
}

const SUIT_CONFIG: {
  suit: Suit;
  label: string;
  symbol: string;
  kingTitle: string;
  colorClass: string;
  accentBg: string;
  badgeBg: string;
  borderClass: string;
}[] = [
  {
    suit: 'SPADE',
    label: 'Spades',
    symbol: '♠',
    kingTitle: 'King of Spades',
    colorClass: 'text-slate-100',
    accentBg: 'from-slate-900 to-slate-800',
    badgeBg: 'bg-slate-800 text-slate-200 border-slate-600',
    borderClass: 'border-slate-700',
  },
  {
    suit: 'HEART',
    label: 'Hearts',
    symbol: '♥',
    kingTitle: 'King of Hearts',
    colorClass: 'text-rose-500',
    accentBg: 'from-rose-950/80 to-slate-900',
    badgeBg: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
    borderClass: 'border-rose-900/40',
  },
  {
    suit: 'CLUB',
    label: 'Clubs',
    symbol: '♣',
    kingTitle: 'King of Clubs',
    colorClass: 'text-emerald-400',
    accentBg: 'from-emerald-950/80 to-slate-900',
    badgeBg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
    borderClass: 'border-emerald-900/40',
  },
  {
    suit: 'DIAMOND',
    label: 'Diamonds',
    symbol: '♦',
    kingTitle: 'King of Diamonds',
    colorClass: 'text-amber-500',
    accentBg: 'from-amber-950/80 to-slate-900',
    badgeBg: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
    borderClass: 'border-amber-900/40',
  },
];

export const RaceTrackStudio: React.FC<RaceTrackStudioProps> = ({
  phase,
  countdown,
  maxCountdown,
  roundId,
  suitCards,
  currentDrawnCards,
  currentDrawnCard,
  winningSuit,
  totalCards,
  totalPoints,
  isMuted,
  onToggleMute,
  turboMode,
}) => {
  const countdownPercent = Math.max(0, Math.min(100, (countdown / maxCountdown) * 100));

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-gradient-to-b from-[#091b15] via-[#0d2a20] to-[#081510] border-2 border-emerald-800/60 shadow-2xl p-3 md:p-5 text-white">
      {/* Casino Felt Pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"
        aria-hidden="true"
      />

      {/* Top Header of the Studio */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-emerald-700/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-950/90 border border-emerald-600/50 px-3 py-1 rounded-full shadow-inner">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-xs font-black tracking-wider uppercase text-emerald-300">LIVE TABLE #01</span>
          </div>

          <div className="text-xs text-emerald-300/80 font-mono bg-black/40 px-2.5 py-1 rounded-md border border-emerald-800/50">
            MID: <span className="text-amber-400 font-bold">{roundId}</span>
          </div>
        </div>

        {/* Live Dealer & Audio Info */}
        <div className="flex items-center gap-3">
          {turboMode && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <Flame className="w-3 h-3 text-amber-400" /> TURBO DEAL
            </span>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 bg-black/30 px-2.5 py-1 rounded border border-white/10">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>DEALER: SOPHIA</span>
          </div>

          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 transition-colors text-slate-300 hover:text-white"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Status & Countdown Bar */}
      <div className="relative z-10 my-3">
        {phase === 'BETTING' && (
          <div className="bg-gradient-to-r from-amber-950/70 via-amber-900/40 to-amber-950/70 border border-amber-500/40 rounded-xl p-2.5 text-center shadow-lg relative overflow-hidden">
            <div
              className="absolute left-0 bottom-0 top-0 bg-amber-500/20 transition-all duration-1000 ease-linear"
              style={{ width: `${countdownPercent}%` }}
            />
            <div className="relative z-10 flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className="animate-spin text-amber-400">⚡</span>
                <span className="text-sm font-black uppercase tracking-wider text-amber-300">
                  PLACE YOUR BETS
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-200">Time Remaining:</span>
                <span
                  className={`font-mono text-lg font-black px-2.5 py-0.5 rounded ${
                    countdown <= 5
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-black/60 text-amber-400 border border-amber-500/40'
                  }`}
                >
                  {countdown}s
                </span>
              </div>
            </div>
          </div>
        )}

        {phase === 'CLOSED' && (
          <div className="bg-gradient-to-r from-rose-950/90 via-red-900/60 to-rose-950/90 border border-rose-500/60 rounded-xl p-2.5 text-center shadow-lg animate-pulse">
            <span className="text-sm font-black tracking-widest text-rose-200 uppercase">
              🔒 BETTING CLOSED — PREPARING CARD SHOE...
            </span>
          </div>
        )}

        {phase === 'DEALING' && (
          <div className="bg-gradient-to-r from-blue-950/90 via-indigo-900/60 to-blue-950/90 border border-blue-400/50 rounded-xl p-2.5 text-center shadow-lg flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-sm font-bold tracking-wider text-blue-200 uppercase">
                RACE IN PROGRESS — DEALING CARDS...
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-amber-300 bg-black/50 px-3 py-1 rounded border border-blue-500/30">
              CARDS DRAWN: <span className="text-white text-sm">{totalCards}</span> | POINTS: <span className="text-white text-sm">{totalPoints}</span>
            </div>
          </div>
        )}

        {phase === 'RESULT' && winningSuit && (
          <div className="bg-gradient-to-r from-amber-900/90 via-yellow-700/80 to-amber-900/90 border-2 border-yellow-400 rounded-xl p-3 text-center shadow-2xl flex flex-wrap items-center justify-between px-4 gap-2 animate-bounce-short">
            <div className="flex items-center gap-2">
              <Crown className="w-6 h-6 text-yellow-300 drop-shadow animate-pulse" />
              <span className="text-base md:text-lg font-black tracking-wide text-yellow-100 uppercase">
                WINNER: {winningSuit} ({getSuitSymbol(winningSuit)}) IN {totalCards} CARDS!
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs md:text-sm font-bold font-mono text-yellow-200 bg-black/60 px-3 py-1 rounded-lg border border-yellow-400/50">
              <span>TOTAL CARDS: <span className="text-white text-base">{totalCards}</span></span>
              <span>•</span>
              <span>TOTAL POINTS: <span className="text-white text-base">{totalPoints}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* The 4 Race Tracks (Spades, Hearts, Clubs, Diamonds) */}
      <div className="relative z-10 space-y-2.5 my-3">
        {SUIT_CONFIG.map((conf) => {
          const cards = suitCards[conf.suit] || [];
          const count = cards.length;
          const isWinner = winningSuit === conf.suit;

          return (
            <div
              key={conf.suit}
              className={`relative rounded-xl p-2 md:p-3 transition-all duration-300 bg-gradient-to-r ${conf.accentBg} border ${
                isWinner
                  ? 'border-yellow-400 ring-2 ring-yellow-400/80 shadow-lg shadow-yellow-500/30'
                  : conf.borderClass
              }`}
            >
              {isWinner && (
                <div className="absolute -top-3 left-4 bg-yellow-400 text-black text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                  <Crown className="w-3 h-3 fill-black" /> WINNER 👑
                </div>
              )}

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                {/* King Card Avatar & Suit Name */}
                <div className="flex items-center gap-3 min-w-[150px]">
                  {/* Miniature King Badge */}
                  <div
                    className={`w-11 h-14 rounded-lg bg-gradient-to-br from-slate-100 to-slate-300 shadow-md border-2 ${
                      isWinner ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-slate-400'
                    } flex flex-col items-center justify-center relative p-0.5 select-none`}
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-600 fill-amber-500 absolute top-0.5" />
                    <span className="font-black text-xs text-slate-900 mt-2 leading-none">K</span>
                    <span className={`text-base font-bold leading-none ${conf.colorClass === 'text-slate-100' ? 'text-slate-900' : conf.colorClass}`}>
                      {conf.symbol}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-lg font-black ${conf.colorClass}`}>{conf.symbol}</span>
                      <span className="font-black text-sm uppercase tracking-wider text-slate-100">
                        {conf.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300/80 font-mono flex items-center gap-1">
                      <span>Progress:</span>
                      <span className={`font-bold ${count >= 4 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {count} / 5
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5 Card Slots for Race to 5 */}
                <div className="flex-1 flex items-center justify-start md:justify-center gap-1.5 sm:gap-2.5 overflow-x-auto py-1">
                  {[0, 1, 2, 3, 4].map((slotIndex) => {
                    const card = cards[slotIndex];
                    const isLastRevealed = currentDrawnCard?.id === card?.id;
                    const isFinishSlot = slotIndex === 4;

                    return (
                      <div key={slotIndex} className="relative flex flex-col items-center">
                        <PlayingCard
                          card={card}
                          empty={!card}
                          emptyLabel={`#${slotIndex + 1}`}
                          isWinning={isWinner && isFinishSlot}
                          size="md"
                          isFlipping={isLastRevealed}
                        />
                        {isFinishSlot && (
                          <div
                            className={`mt-1 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 ${
                              isWinner ? 'text-yellow-400' : 'text-slate-400'
                            }`}
                          >
                            <Crown className="w-2.5 h-2.5" /> WIN
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Progress Mini Bar on Right */}
                <div className="hidden lg:flex flex-col items-end min-w-[80px]">
                  <div className="w-20 bg-black/60 rounded-full h-2 overflow-hidden border border-white/10">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isWinner
                          ? 'bg-yellow-400'
                          : count >= 4
                          ? 'bg-rose-500'
                          : count >= 3
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${(count / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 font-mono">
                    {Math.round((count / 5) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawn Cards History Strip during round */}
      <div className="relative z-10 mt-3 pt-3 border-t border-emerald-700/30">
        <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
          <div className="flex items-center gap-1.5 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>CARDS DEALT THIS ROUND ({currentDrawnCards.length})</span>
          </div>
          <div className="font-mono text-[11px] text-emerald-300">
            Current Points: <span className="text-amber-400 font-bold">{totalPoints}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {currentDrawnCards.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-2">
              No cards dealt yet. Bets close and cards start dealing when the timer ends.
            </div>
          ) : (
            currentDrawnCards.map((c, i) => {
              const isRed = c.color === 'RED';
              return (
                <div
                  key={`${c.id}-${i}`}
                  className="flex-shrink-0 flex items-center gap-1 bg-black/60 border border-white/10 px-2 py-1 rounded text-xs font-mono shadow"
                >
                  <span className="text-slate-400 text-[10px]">#{i + 1}</span>
                  <span className={`font-bold ${isRed ? 'text-rose-400' : 'text-slate-100'}`}>
                    {c.rank}
                    {getSuitSymbol(c.suit)}
                  </span>
                  <span className="text-amber-400 text-[10px]">(+{c.value})</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
