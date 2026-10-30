'use client';

import React, { useState } from 'react';
import { Bet, SettledBet } from '../types';
import { X, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useDailyPoolMode } from '@/lib/walletSync';

interface ActiveBetsPanelProps {
  activeBets: Bet[];
  settledBets: SettledBet[];
  onRemoveBet: (id: string) => void;
  canRemove: boolean;
}

export const ActiveBetsPanel: React.FC<ActiveBetsPanelProps> = ({
  activeBets,
  settledBets,
  onRemoveBet,
  canRemove,
}) => {
  const poolEnabled = useDailyPoolMode();
  const [tab, setTab] = useState<'active' | 'settled'>('active');

  const totalActiveStake = activeBets.reduce((sum, b) => sum + b.stake, 0);

  return (
    <div className="w-full bg-slate-900/95 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/70 px-3 pt-2 gap-2">
        <button
          onClick={() => setTab('active')}
          className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'active'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Active Bets ({activeBets.length})</span>
        </button>

        <button
          onClick={() => setTab('settled')}
          className={`pb-2 px-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'settled'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Last Round Bets ({settledBets.length})</span>
        </button>
      </div>

      {/* List */}
      <div className="p-3 max-h-56 overflow-y-auto space-y-2 scrollbar-thin">
        {tab === 'active' ? (
          activeBets.length === 0 ? (
            <div className="text-center py-5 text-slate-500 text-xs">
              No active bets. Select a chip and click on Back/Lay or Fancy odds to place bets.
            </div>
          ) : (
            activeBets.map((bet) => (
              <div
                key={bet.id}
                className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-slate-800 text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      bet.isLay ? 'bg-rose-500/20 text-rose-300' : 'bg-sky-500/20 text-sky-300'
                    }`}
                  >
                    {bet.isLay ? 'LAY' : 'BACK'}
                  </span>
                  <div>
                    <div className="font-bold text-slate-200">{bet.targetLabel}</div>
                    <div className="text-[10px] text-slate-400">
                      Odds: <span className="text-amber-400">{bet.odds.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-white font-bold">Rs. {bet.stake.toLocaleString()}</div>
                  </div>

                  {canRemove && (
                    <button
                      onClick={() => onRemoveBet(bet.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      title="Cancel bet"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )
        ) : (
          settledBets.length === 0 ? (
            <div className="text-center py-5 text-slate-500 text-xs">
              No settled bets yet from previous rounds.
            </div>
          ) : (
            settledBets.map((bet) => (
              <div
                key={bet.id}
                className={`flex items-center justify-between p-2 rounded-lg border text-xs font-mono ${
                  bet.won
                    ? 'bg-emerald-950/30 border-emerald-600/40'
                    : 'bg-rose-950/30 border-rose-600/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      bet.won ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {bet.won ? '✓' : '✗'}
                  </span>
                  <div>
                    <div className="font-bold text-slate-200">{bet.targetLabel}</div>
                    <div className="text-[10px] text-slate-400">Stake: Rs. {bet.stake.toLocaleString()}</div>
                  </div>
                </div>

                <div className="text-right font-bold">
                  {poolEnabled ? (
                    <div className="text-amber-300">Daily payout pending · provisional claim Rs. {bet.payout.toLocaleString()}</div>
                  ) : bet.won ? (
                    <div className="text-emerald-400">+Rs. {bet.profit.toLocaleString()}</div>
                  ) : (
                    <div className="text-rose-400">No win</div>
                  )}
                </div>
              </div>
            ))
          )
        )}
      </div>

      {tab === 'active' && activeBets.length > 0 && (
        <div className="bg-slate-950/80 px-3 py-2 border-t border-slate-800 flex justify-between text-xs font-mono">
          <span className="text-slate-400">Total Active Stake:</span>
          <span className="font-bold text-amber-400">Rs. {totalActiveStake.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};
