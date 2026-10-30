'use client';

import React from 'react';
import { RoundResult } from '../types';
import { PlayingCard, getSuitSymbol } from './PlayingCard';
import { X, Crown, Calendar, Sparkles } from 'lucide-react';

interface RoundDetailModalProps {
  round: RoundResult | null;
  onClose: () => void;
}

export const RoundDetailModal: React.FC<RoundDetailModalProps> = ({ round, onClose }) => {
  if (!round) return null;

  const isRed = round.winningSuit === 'HEART' || round.winningSuit === 'DIAMOND';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
                ROUND RESULT DETAILS
              </h2>
              <span className="text-xs font-mono text-slate-400">ID: {round.roundId}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-300">
          {/* Winner Banner */}
          <div className="bg-gradient-to-r from-amber-950/70 via-yellow-950/50 to-amber-950/70 border border-yellow-500/40 p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`w-10 h-10 rounded-xl bg-white shadow-md flex items-center justify-center text-2xl font-black ${
                  isRed ? 'text-rose-600' : 'text-slate-950'
                }`}
              >
                {getSuitSymbol(round.winningSuit)}
              </span>
              <div>
                <div className="text-xs text-amber-400 font-bold uppercase">WINNER</div>
                <div className="text-base font-black text-white">
                  King of {round.winningSuit}s
                </div>
              </div>
            </div>

            <div className="text-right font-mono">
              <div className="text-amber-400 font-bold">{round.totalCards} CARDS</div>
              <div className="text-slate-300 text-xs">{round.totalPoints} TOTAL POINTS</div>
            </div>
          </div>

          {/* Cards Sequence in dealing order */}
          <div>
            <div className="flex items-center gap-1.5 font-bold text-white mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Full Deal Order ({round.cardsSequence.length} Cards)</span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {round.cardsSequence.map((c, idx) => (
                <div key={`${c.id}-${idx}`} className="flex flex-col items-center">
                  <PlayingCard
                    card={c}
                    size="sm"
                    isWinning={idx === round.cardsSequence.length - 1}
                  />
                  <span className="text-[10px] text-slate-400 mt-1 font-mono">#{idx + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Breakdown by King */}
          <div className="space-y-1.5 pt-2">
            <div className="text-xs font-bold text-slate-400 uppercase">Cards by King:</div>
            {(['SPADE', 'HEART', 'CLUB', 'DIAMOND'] as const).map((s) => {
              const list = round.suitCards[s] || [];
              const isWin = s === round.winningSuit;
              return (
                <div
                  key={s}
                  className={`flex items-center justify-between p-2 rounded-lg font-mono text-xs ${
                    isWin ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' : 'bg-slate-950/40'
                  }`}
                >
                  <span className="font-bold">
                    {getSuitSymbol(s)} {s}:
                  </span>
                  <span>{list.length} cards ({list.map((c) => `${c.rank}${getSuitSymbol(c.suit)}`).join(', ')})</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
