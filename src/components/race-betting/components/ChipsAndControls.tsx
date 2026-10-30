'use client';

import React from 'react';
import { GamePhase } from '../types';
import { RotateCcw, Trash2, ArrowUpRight, Zap } from 'lucide-react';
import { BET_PRESETS } from '@/lib/betPresets';

interface ChipsAndControlsProps {
  phase: GamePhase;
  selectedChip: number;
  onSelectChip: (val: number) => void;
  totalStake: number;
  potentialProfit: number;
  onClearBets: () => void;
  onDoubleBets: () => void;
  onRepeatBets: () => void;
  canRepeat: boolean;
  canDouble: boolean;
}

const CHIP_COLORS = [
  'from-blue-600 to-blue-800 border-blue-400 text-white',
  'from-rose-600 to-rose-800 border-rose-400 text-white',
  'from-emerald-600 to-emerald-800 border-emerald-400 text-white',
  'from-purple-600 to-purple-800 border-purple-400 text-white',
  'from-amber-600 to-amber-800 border-amber-300 text-amber-100',
];
const CHIP_VALUES = BET_PRESETS.map((val, i) => ({ val: val as number, label: String(val), color: CHIP_COLORS[i % CHIP_COLORS.length] }));

export const ChipsAndControls: React.FC<ChipsAndControlsProps> = ({
  phase,
  selectedChip,
  onSelectChip,
  totalStake,
  potentialProfit,
  onClearBets,
  onDoubleBets,
  onRepeatBets,
  canRepeat,
  canDouble,
}) => {
  const isBettingDisabled = phase !== 'BETTING';

  return (
    <div className="w-full bg-slate-950/95 border-t border-slate-800 p-3 shadow-2xl rounded-2xl">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* Chips Bar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 py-1 px-1 w-full lg:w-auto justify-center">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline mr-1">
            CHIPS:
          </span>
          {CHIP_VALUES.map((chip) => {
            const isSelected = selectedChip === chip.val;
            return (
              <button
                key={chip.val}
                onClick={() => onSelectChip(chip.val)}
                className={`group relative flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${chip.color} border-2 flex items-center justify-center font-black text-xs sm:text-sm shadow-md transition-all duration-150 transform hover:-translate-y-1 active:translate-y-0 ${
                  isSelected
                    ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-950 scale-110 shadow-amber-500/50 -translate-y-1'
                    : 'opacity-85 hover:opacity-100'
                }`}
              >
                {/* Chip Inner Circle / Ridge detail */}
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-dashed border-white/40 flex items-center justify-center">
                  <span>{chip.label}</span>
                </div>
              </button>
            );
          })}
          <input
            type="number"
            min={10}
            inputMode="numeric"
            aria-label="Custom bet amount"
            placeholder="Custom"
            value={selectedChip || ''}
            onChange={(e) => onSelectChip(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            className="flex-shrink-0 w-20 h-10 rounded-lg bg-black/60 border border-slate-700 text-center text-sm font-bold text-white outline-none"
          />
        </div>

        {/* Quick Action Buttons & Current Bet Summary */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full lg:w-auto">
          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              disabled={isBettingDisabled || !canDouble}
              onClick={onDoubleBets}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/40 hover:to-orange-500/40 text-amber-300 border border-amber-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
              title="Double current stakes (2X)"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>2X</span>
            </button>

            <button
              disabled={isBettingDisabled || !canRepeat}
              onClick={onRepeatBets}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/40 hover:to-blue-500/40 text-cyan-300 border border-cyan-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
              title="Repeat previous bets"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Repeat</span>
            </button>

            <button
              disabled={isBettingDisabled || totalStake === 0}
              onClick={onClearBets}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-rose-950/60 to-red-950/60 hover:from-rose-900/80 hover:to-red-900/80 text-rose-300 border border-rose-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
              title="Clear all bets on the table"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>

          {/* Current Bet Summary display */}
          <div className="flex items-center gap-3 bg-black/60 px-3 py-1.5 rounded-xl border border-slate-800 font-mono">
            <div>
              <div className="text-[10px] text-slate-400 leading-none">TOTAL STAKE</div>
              <div className="text-sm font-black text-white leading-tight">
                Rs. {totalStake.toLocaleString()}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
