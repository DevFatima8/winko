'use client';

import React from 'react';
import { RoundResult, Suit } from '../types';
import { getSuitColorClass, getSuitSymbol } from './PlayingCard';
import { History, BarChart2 } from 'lucide-react';

interface RecentResultsBarProps {
  history: RoundResult[];
  onSelectRound?: (round: RoundResult) => void;
}

export const RecentResultsBar: React.FC<RecentResultsBarProps> = ({
  history,
  onSelectRound,
}) => {
  if (history.length === 0) {
    return null;
  }

  // Calculate percentages
  const total = history.length;
  const suitCounts: Record<Suit, number> = {
    SPADE: history.filter((r) => r.winningSuit === 'SPADE').length,
    HEART: history.filter((r) => r.winningSuit === 'HEART').length,
    CLUB: history.filter((r) => r.winningSuit === 'CLUB').length,
    DIAMOND: history.filter((r) => r.winningSuit === 'DIAMOND').length,
  };

  const getPercent = (s: Suit) => (total > 0 ? Math.round((suitCounts[s] / total) * 100) : 25);

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
          <History className="w-3.5 h-3.5 text-amber-400" />
          <span className="uppercase tracking-wider">RECENT ROUNDS ({history.length})</span>
        </div>

        {/* Stats mini bar */}
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-slate-400 flex items-center gap-1">
            <BarChart2 className="w-3 h-3 text-slate-400" /> Stats:
          </span>
          <span className="text-slate-200 font-bold">♠ {getPercent('SPADE')}%</span>
          <span className="text-rose-400 font-bold">♥ {getPercent('HEART')}%</span>
          <span className="text-emerald-400 font-bold">♣ {getPercent('CLUB')}%</span>
          <span className="text-amber-400 font-bold">♦ {getPercent('DIAMOND')}%</span>
        </div>
      </div>

      {/* Ribbon of round outcome badges */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {history.slice(0, 15).map((r) => {
          const isRed = r.winningSuit === 'HEART' || r.winningSuit === 'DIAMOND';
          return (
            <button
              key={r.roundId}
              onClick={() => onSelectRound && onSelectRound(r)}
              className="group flex-shrink-0 flex items-center gap-1.5 bg-black/60 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/50 px-2.5 py-1.5 rounded-lg transition-all shadow-sm"
              title={`Round: ${r.roundId} | Winner: ${r.winningSuit} | Cards: ${r.totalCards} | Points: ${r.totalPoints}`}
            >
              <span
                className={`w-6 h-6 rounded flex items-center justify-center font-black text-sm bg-white shadow-inner ${
                  isRed ? 'text-rose-600' : 'text-slate-950'
                }`}
              >
                {getSuitSymbol(r.winningSuit)}
              </span>
              <div className="flex flex-col text-left leading-tight font-mono">
                <span className="text-[10px] text-amber-400 font-bold">{r.totalCards}C</span>
                <span className="text-[9px] text-slate-400">{r.totalPoints}P</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
