'use client';

import React from 'react';
import { Bet, BetType, GamePhase, Suit } from '../types';
import { getSuitSymbol } from './PlayingCard';
import { CheckCircle2, TrendingUp } from 'lucide-react';

interface OddsBoardProps {
  phase: GamePhase;
  activeBets: Bet[];
  selectedChip: number;
  onPlaceBet: (type: BetType, label: string, odds: number, target?: Suit, isLay?: boolean) => void;
}

export const OddsBoard: React.FC<OddsBoardProps> = ({
  phase,
  activeBets,
  onPlaceBet,
}) => {
  const isBettingDisabled = false;

  // Helper to find total staked on a specific bet
  const getBetStake = (type: BetType, target?: Suit, isLay?: boolean): number => {
    return activeBets
      .filter((b) => b.type === type && b.target === target && Boolean(b.isLay) === Boolean(isLay))
      .reduce((sum, b) => sum + b.stake, 0);
  };

  const SUIT_ROWS: { suit: Suit; label: string; symbol: string; color: string }[] = [
    { suit: 'SPADE', label: 'Spade (Kâ™ )', symbol: 'â™ ', color: 'text-slate-900' },
    { suit: 'HEART', label: 'Heart (Kâ™¥)', symbol: 'â™¥', color: 'text-rose-600' },
    { suit: 'CLUB', label: 'Club (Kâ™£)', symbol: 'â™£', color: 'text-emerald-700' },
    { suit: 'DIAMOND', label: 'Diamond (Kâ™¦)', symbol: 'â™¦', color: 'text-amber-700' },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Main King Winner Market (Exchange Style: Back Blue / Lay Pink) */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2.5 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
            <h3 className="text-sm font-black text-white tracking-wide uppercase">
              MAIN WINNER (RACE TO 5 CARDS)
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-300">
            <span className="hidden sm:inline text-slate-400">Min: Rs. 10 | Max: Rs. 50,000</span>
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-12 bg-slate-800/80 px-2 sm:px-4 py-1.5 text-xs font-bold text-slate-300 border-b border-slate-700/60">
          <div className="col-span-6 sm:col-span-7">SELECTION</div>
          <div className="col-span-3 sm:col-span-2 text-center text-sky-400 uppercase">BACK</div>
          <div className="col-span-3 text-center text-rose-400 uppercase">LAY</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-800">
          {SUIT_ROWS.map((r) => {
            const backStake = getBetStake('SUIT_BACK', r.suit, false);
            const layStake = getBetStake('SUIT_LAY', r.suit, true);

            return (
              <div
                key={r.suit}
                className="grid grid-cols-12 items-center px-2 sm:px-4 py-2 hover:bg-slate-800/40 transition-colors"
              >
                {/* Selection name & symbol */}
                <div className="col-span-6 sm:col-span-7 flex items-center gap-2">
                  <span className={`text-xl font-black ${r.color} bg-white/95 px-2 py-0.5 rounded shadow-sm`}>
                    {r.symbol}
                  </span>
                  <div>
                    <span className="font-bold text-sm text-white tracking-wide">{r.label}</span>
                    {(backStake > 0 || layStake > 0) && (
                      <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
                        {backStake > 0 && (
                          <span className="bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded font-mono font-bold border border-sky-500/30">
                            Back: Rs. {backStake.toLocaleString()}
                          </span>
                        )}
                        {layStake > 0 && (
                          <span className="bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-mono font-bold border border-rose-500/30">
                            Lay: Rs. {layStake.toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* BACK BUTTON (Sky Blue) */}
                <div className="col-span-3 sm:col-span-2 px-1">
                  <button
                    disabled={isBettingDisabled}
                    onClick={() =>
                      onPlaceBet('SUIT_BACK', `${r.label} (Back)`, 3.75, r.suit, false)
                    }
                    className={`w-full py-2 rounded-lg font-black text-center transition-all shadow-md active:scale-95 ${
                      isBettingDisabled
                        ? 'bg-slate-700/60 text-slate-400 cursor-not-allowed opacity-60'
                        : 'bg-[#72BBEF] hover:bg-[#5caae3] text-slate-950 hover:shadow-sky-500/30 ring-1 ring-sky-300'
                    }`}
                  >
                    <div className="text-sm font-black leading-tight">3.75</div>
                    <div className="text-[10px] uppercase font-bold text-slate-800 leading-none">
                      BACK
                    </div>
                  </button>
                </div>

                {/* LAY BUTTON (Soft Pink) */}
                <div className="col-span-3 px-1">
                  <button
                    disabled={isBettingDisabled}
                    onClick={() =>
                      onPlaceBet('SUIT_LAY', `${r.label} (Lay)`, 3.9, r.suit, true)
                    }
                    className={`w-full py-2 rounded-lg font-black text-center transition-all shadow-md active:scale-95 ${
                      isBettingDisabled
                        ? 'bg-slate-700/60 text-slate-400 cursor-not-allowed opacity-60'
                        : 'bg-[#F8D0CE] hover:bg-[#f3bcba] text-slate-950 hover:shadow-rose-400/30 ring-1 ring-rose-300'
                    }`}
                  >
                    <div className="text-sm font-black leading-tight">3.90</div>
                    <div className="text-[10px] uppercase font-bold text-slate-800 leading-none">
                      LAY
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Color Market: RED vs BLACK */}
      <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-black text-white tracking-wide uppercase">
              COLOR BET (WHICH COLOR WINS?)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Payout 1.95x</span>
        </div>

        <div className="grid grid-cols-2 p-3 gap-3">
          {/* RED */}
          {(() => {
            const stake = getBetStake('COLOR_RED');
            return (
              <button
                disabled={isBettingDisabled}
                onClick={() => onPlaceBet('COLOR_RED', 'RED (â™¥ Hearts / â™¦ Diamonds)', 1.95)}
                className={`relative p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  isBettingDisabled
                    ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                    : 'bg-gradient-to-br from-rose-950/70 via-red-900/40 to-slate-900 border-rose-600/60 hover:border-rose-400 hover:shadow-lg hover:shadow-rose-600/20 active:scale-95'
                }`}
              >
                {stake > 0 && (
                  <span className="absolute top-2 right-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                      <CheckCircle2 className="w-3 h-3" /> Rs. {stake.toLocaleString()}
                  </span>
                )}
                <div className="flex items-center gap-1.5 text-rose-400 text-2xl font-black">
                  <span>â™¥</span>
                  <span>â™¦</span>
                </div>
                <div className="text-base font-black text-white mt-1">RED SUITS</div>
                <div className="text-xs text-rose-300 font-mono mt-0.5">Odds: 1.95</div>
              </button>
            );
          })()}

          {/* BLACK */}
          {(() => {
            const stake = getBetStake('COLOR_BLACK');
            return (
              <button
                disabled={isBettingDisabled}
                onClick={() => onPlaceBet('COLOR_BLACK', 'BLACK (â™  Spades / â™£ Clubs)', 1.95)}
                className={`relative p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  isBettingDisabled
                    ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                    : 'bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 border-slate-500 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-500/20 active:scale-95'
                }`}
              >
                {stake > 0 && (
                  <span className="absolute top-2 right-2 bg-slate-200 text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                      <CheckCircle2 className="w-3 h-3" /> Rs. {stake.toLocaleString()}
                  </span>
                )}
                <div className="flex items-center gap-1.5 text-slate-300 text-2xl font-black">
                  <span>â™ </span>
                  <span>â™£</span>
                </div>
                <div className="text-base font-black text-white mt-1">BLACK SUITS</div>
                <div className="text-xs text-slate-300 font-mono mt-0.5">Odds: 1.95</div>
              </button>
            );
          })()}
        </div>
      </div>

      {/* Fancy Bets Grid: Total Cards & Total Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Total Cards Market */}
        <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl p-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-700 mb-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>ðŸƒ TOTAL CARDS TO FINISH</span>
            </h4>
            <span className="text-[11px] text-amber-400 font-bold">Fancy Market</span>
          </div>

          <div className="space-y-2">
            {/* Over / Under 10.5 */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  type: 'TOTAL_CARDS_OVER' as BetType,
                  label: 'Over 10.5 Cards',
                  odds: 1.9,
                },
                {
                  type: 'TOTAL_CARDS_UNDER' as BetType,
                  label: 'Under 10.5 Cards',
                  odds: 1.9,
                },
              ].map((item) => {
                const stake = getBetStake(item.type);
                return (
                  <button
                    key={item.type}
                    disabled={isBettingDisabled}
                    onClick={() => onPlaceBet(item.type, item.label, item.odds)}
                    className={`p-2.5 rounded-lg border text-left flex justify-between items-center transition-all ${
                      isBettingDisabled
                        ? 'bg-slate-800/50 text-slate-500 border-slate-800'
                        : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 hover:border-amber-400/60 active:scale-95'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      {stake > 0 && (
                        <div className="text-[10px] text-emerald-400 font-mono">
                          Rs. {stake.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-black text-xs text-amber-400 bg-black/40 px-2 py-0.5 rounded">
                      {item.odds.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Odd / Even Cards */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  type: 'TOTAL_CARDS_ODD' as BetType,
                  label: 'Total Cards ODD',
                  odds: 1.95,
                },
                {
                  type: 'TOTAL_CARDS_EVEN' as BetType,
                  label: 'Total Cards EVEN',
                  odds: 1.95,
                },
              ].map((item) => {
                const stake = getBetStake(item.type);
                return (
                  <button
                    key={item.type}
                    disabled={isBettingDisabled}
                    onClick={() => onPlaceBet(item.type, item.label, item.odds)}
                    className={`p-2.5 rounded-lg border text-left flex justify-between items-center transition-all ${
                      isBettingDisabled
                        ? 'bg-slate-800/50 text-slate-500 border-slate-800'
                        : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 hover:border-amber-400/60 active:scale-95'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      {stake > 0 && (
                        <div className="text-[10px] text-emerald-400 font-mono">
                          Rs. {stake.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-black text-xs text-amber-400 bg-black/40 px-2 py-0.5 rounded">
                      {item.odds.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Range Bets: 5-8, 9-12, 13-17 */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {[
                { type: 'CARDS_5_8' as BetType, label: '5 to 8', odds: 4.5 },
                { type: 'CARDS_9_12' as BetType, label: '9 to 12', odds: 1.85 },
                { type: 'CARDS_13_17' as BetType, label: '13 to 17', odds: 3.8 },
              ].map((item) => {
                const stake = getBetStake(item.type);
                return (
                  <button
                    key={item.type}
                    disabled={isBettingDisabled}
                    onClick={() => onPlaceBet(item.type, `Range ${item.label} Cards`, item.odds)}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      isBettingDisabled
                        ? 'bg-slate-800/50 text-slate-500 border-slate-800'
                        : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 hover:border-amber-400/60 active:scale-95'
                    }`}
                  >
                    <div className="text-[11px] font-bold text-white leading-tight">{item.label}</div>
                    <div className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                      {item.odds.toFixed(2)}
                    </div>
                    {stake > 0 && (
                      <div className="text-[9px] text-emerald-400 font-mono mt-0.5">
                        Rs. {stake.toLocaleString()}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Total Points Market */}
        <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl p-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-700 mb-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>ðŸŽ¯ TOTAL CARD POINTS</span>
            </h4>
            <span className="text-[11px] text-amber-400 font-bold">A=1, J=11, Q=12</span>
          </div>

          <div className="space-y-2">
            {/* Over / Under 70.5 */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  type: 'TOTAL_POINTS_OVER' as BetType,
                  label: 'Over 70.5 Pts',
                  odds: 1.9,
                },
                {
                  type: 'TOTAL_POINTS_UNDER' as BetType,
                  label: 'Under 70.5 Pts',
                  odds: 1.9,
                },
              ].map((item) => {
                const stake = getBetStake(item.type);
                return (
                  <button
                    key={item.type}
                    disabled={isBettingDisabled}
                    onClick={() => onPlaceBet(item.type, item.label, item.odds)}
                    className={`p-2.5 rounded-lg border text-left flex justify-between items-center transition-all ${
                      isBettingDisabled
                        ? 'bg-slate-800/50 text-slate-500 border-slate-800'
                        : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 hover:border-amber-400/60 active:scale-95'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      {stake > 0 && (
                        <div className="text-[10px] text-emerald-400 font-mono">
                          Rs. {stake.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-black text-xs text-amber-400 bg-black/40 px-2 py-0.5 rounded">
                      {item.odds.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Odd / Even Points */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  type: 'TOTAL_POINTS_ODD' as BetType,
                  label: 'Points ODD',
                  odds: 1.95,
                },
                {
                  type: 'TOTAL_POINTS_EVEN' as BetType,
                  label: 'Points EVEN',
                  odds: 1.95,
                },
              ].map((item) => {
                const stake = getBetStake(item.type);
                return (
                  <button
                    key={item.type}
                    disabled={isBettingDisabled}
                    onClick={() => onPlaceBet(item.type, item.label, item.odds)}
                    className={`p-2.5 rounded-lg border text-left flex justify-between items-center transition-all ${
                      isBettingDisabled
                        ? 'bg-slate-800/50 text-slate-500 border-slate-800'
                        : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 hover:border-amber-400/60 active:scale-95'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      {stake > 0 && (
                        <div className="text-[10px] text-emerald-400 font-mono">
                          Rs. {stake.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-black text-xs text-amber-400 bg-black/40 px-2 py-0.5 rounded">
                      {item.odds.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="p-2.5 bg-black/40 rounded-lg border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              ðŸ’¡ <span className="text-slate-300 font-medium">Points calculation:</span> Each card dealt contributes its numerical value (Ace=1, 2-10=face value, Jack=11, Queen=12). The total sum when the 5th card of any suit drops decides the points!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
