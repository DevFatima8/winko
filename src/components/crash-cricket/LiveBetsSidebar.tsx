"use client";

import React, { useState } from "react";
import {
  GamePhase,
  INITIAL_TOP_WINS,
  LiveBetEntry,
  RoundHistoryItem,
  UserBetRecord,
} from "./lib/crashEngine";
import { soundEngine } from "./lib/soundEngine";
import { Award, BarChart3, History, ShieldCheck, Users } from "lucide-react";
import { useDailyPoolMode } from "@/lib/walletSync";

interface LiveBetsSidebarProps {
  phase: GamePhase;
  liveBets: LiveBetEntry[];
  userBetHistory: UserBetRecord[];
  roundHistory: RoundHistoryItem[];
}

export default function LiveBetsSidebar({
  phase,
  liveBets,
  userBetHistory,
  roundHistory,
}: LiveBetsSidebarProps) {
  const poolEnabled = useDailyPoolMode();
  const [activeTab, setActiveTab] = useState<"ALL" | "MY" | "TOP">("ALL");

  const totalPool = liveBets.reduce((acc, b) => acc + b.betAmount, 0);
  const cashedOutCount = liveBets.filter((b) => b.cashedOutAt !== null).length;
  const cashedOutPercent =
    liveBets.length > 0
      ? Math.round((cashedOutCount / liveBets.length) * 100)
      : 0;

  return (
    <aside className="w-full lg:w-[325px] shrink-0 bg-[#0B111E] border border-[#1E2D4A] rounded-xl flex flex-col h-[440px] lg:h-[calc(100vh-76px)] overflow-hidden">
      {/* Top 3-Tab Switcher */}
      <div className="p-2 bg-[#070B14]/60 border-b border-[#1E2D4A]">
        <div className="grid grid-cols-3 gap-1 bg-[#131C2E] p-1 rounded-lg border border-[#1E2D4A]">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setActiveTab("ALL");
            }}
            className={`py-1.5 px-2 rounded-md text-xs font-display font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === "ALL"
              ? "bg-[#00E701] text-[#070B14] shadow"
              : "text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            All Bets
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setActiveTab("MY");
            }}
            className={`py-1.5 px-2 rounded-md text-xs font-display font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === "MY"
              ? "bg-[#00E701] text-[#070B14] shadow"
              : "text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
          >
            <History className="w-3.5 h-3.5" />
            My Bets
            {userBetHistory.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#0B111E]/30 text-[10px] font-mono-tabular">
                {userBetHistory.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setActiveTab("TOP");
            }}
            className={`py-1.5 px-2 rounded-md text-xs font-display font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === "TOP"
              ? "bg-[#00E701] text-[#070B14] shadow"
              : "text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
          >
            <Award className="w-3.5 h-3.5" />
            Top
          </button>
        </div>
      </div>

      {/* TAB 1: ALL BETS */}
      {activeTab === "ALL" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Round Pool Summary Header */}
          <div className="px-3 py-2.5 bg-[#131C2E]/60 border-b border-[#1E2D4A] flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00E701] animate-pulse" />
                <span className="font-display font-bold uppercase text-[#F8FAFC] tracking-wider">
                  {liveBets.length} ACTIVE PLAYERS
                </span>
              </div>
              <div className="font-mono-tabular font-bold text-[#00E701]">
                Rs. {totalPool.toLocaleString("en-IN")}
              </div>
            </div>

            {/* Cashout Progress Bar */}
            <div className="w-full h-1.5 bg-[#070B14] rounded-full overflow-hidden border border-[#1E2D4A]/80">
              <div
                className="h-full bg-gradient-to-r from-[#00E701] to-[#FFB800] transition-all duration-200"
                style={{ width: `${cashedOutPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#94A3B8] font-mono-tabular">
              <span>
                Cashed Out: {cashedOutCount}/{liveBets.length} ({cashedOutPercent}%)
              </span>
              <span>
                {phase === "BETTING"
                  ? "Accepting Bets..."
                  : phase === "IN_FLIGHT"
                    ? "Ball in Flight"
                    : "Round Ended"}
              </span>
            </div>
          </div>

          {/* Column Headers */}
          <div className="grid grid-cols-12 px-3 py-1.5 bg-[#070B14]/50 border-b border-[#1E2D4A] text-[10px] font-display font-bold uppercase tracking-wider text-[#94A3B8]">
            <div className="col-span-5">Player</div>
            <div className="col-span-3 text-right">Bet (Rs)</div>
            <div className="col-span-2 text-center">X</div>
            <div className="col-span-2 text-right">Win</div>
          </div>

          {/* Scrollable Live Bets List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1E2D4A]/40 px-1.5 py-1">
            {liveBets.map((bet) => {
              const hasWon = bet.cashedOutAt !== null;
              const hasLost = phase === "CRASHED" && !hasWon;

              return (
                <div
                  key={bet.id}
                  className={`grid grid-cols-12 items-center px-2 py-1.5 rounded-lg my-0.5 text-xs transition-colors ${hasWon
                    ? "bg-[#00E701]/12 border border-[#00E701]/35"
                    : bet.isUser
                      ? "bg-[#38BDF8]/12 border border-[#38BDF8]/40"
                      : hasLost
                        ? "opacity-50"
                        : "hover:bg-[#131C2E]/60"
                    }`}
                >
                  {/* Player Avatar + Name */}
                  <div className="col-span-5 flex items-center gap-2 truncate">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-[#070B14] shrink-0"
                      style={{ backgroundColor: bet.avatarColor }}
                    >
                      {bet.username.slice(0, 2).toUpperCase()}
                    </div>
                    <span
                      className={`truncate font-medium ${bet.isUser
                        ? "text-[#38BDF8] font-bold"
                        : hasWon
                          ? "text-[#F8FAFC] font-semibold"
                          : "text-[#94A3B8]"
                        }`}
                    >
                      {bet.username}
                    </span>
                  </div>

                  {/* Stake Amount */}
                  <div className="col-span-3 text-right font-mono-tabular text-[#F8FAFC] font-medium">
                    {bet.betAmount.toLocaleString("en-IN")}
                  </div>

                  {/* Cashout Multiplier Pill */}
                  <div className="col-span-2 flex justify-center">
                    {hasWon && bet.cashedOutAt ? (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-bold ${bet.cashedOutAt >= 10
                          ? "bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40"
                          : bet.cashedOutAt >= 2
                            ? "bg-[#00E701]/20 text-[#00E701] border border-[#00E701]/40"
                            : "bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40"
                          }`}
                      >
                        {bet.cashedOutAt.toFixed(2)}x
                      </span>
                    ) : hasLost ? (
                      <span className="text-[10px] font-mono-tabular text-[#FF2A4B]">
                        OUT
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono-tabular text-[#94A3B8]">
                        -
                      </span>
                    )}
                  </div>

                  {/* Win Payout */}
                  <div className="col-span-2 text-right font-mono-tabular font-bold">
                    {hasWon && bet.winAmount ? (
                      <span className="text-[#00E701]">
                        {Math.round(bet.winAmount).toLocaleString("en-IN")}
                      </span>
                    ) : (
                      <span className="text-[#94A3B8]">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: MY BETS & 35/65 RNG ENGINE TELEMETRY */}
      {activeTab === "MY" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 bg-[#131C2E]/80 border-b border-[#1E2D4A] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="px-1.5 py-0.5 rounded bg-[#00E701]/15 text-[#00E701] font-mono-tabular text-[10px] font-bold">
                LOCKED
              </span>
            </div>

          </div>

          {/* Column Headers */}
          <div className="grid grid-cols-12 px-3 py-1.5 bg-[#070B14]/50 border-b border-[#1E2D4A] text-[10px] font-display font-bold uppercase tracking-wider text-[#94A3B8]">
            <div className="col-span-3">Over</div>
            <div className="col-span-3 text-right">Bet</div>
            <div className="col-span-3 text-center">Cashout</div>
            <div className="col-span-3 text-right">{poolEnabled ? "Game net (not paid)" : "P/L (Rs)"}</div>
          </div>

          {/* User Bet History List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1E2D4A]/40 px-2 py-1">
            {userBetHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#94A3B8]">
                <History className="w-8 h-8 mb-2 opacity-40 text-[#38BDF8]" />
                <p className="text-xs font-display font-bold uppercase tracking-wider text-[#F8FAFC]">
                  No Bets Placed Yet
                </p>
                <p className="text-[11px] mt-1">
                  Use Bet Panel #1 or #2 below the stadium to place your first
                  bet!
                </p>
              </div>
            ) : (
              userBetHistory.map((item) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-12 items-center px-2 py-2 rounded-lg my-0.5 text-xs ${item.won
                    ? "bg-[#00E701]/10 border border-[#00E701]/30"
                    : "bg-[#FF2A4B]/10 border border-[#FF2A4B]/25"
                    }`}
                >
                  <div className="col-span-3 flex flex-col">
                    <span className="font-mono-tabular font-bold text-[#F8FAFC]">
                      #{item.roundId}
                    </span>
                    <span className="text-[10px] text-[#94A3B8]">
                      Panel #{item.panelId}
                    </span>
                  </div>

                  <div className="col-span-3 text-right font-mono-tabular text-[#F8FAFC]">
                    {item.betAmount.toLocaleString("en-IN")}
                  </div>

                  <div className="col-span-3 flex justify-center">
                    {item.won && item.cashedOutAt ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#00E701]/20 text-[#00E701] font-mono-tabular font-bold text-[10px]">
                        {item.cashedOutAt.toFixed(2)}x
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-[#FF2A4B]/20 text-[#FF2A4B] font-mono-tabular font-bold text-[10px]">
                        @{item.crashPoint.toFixed(2)}x
                      </span>
                    )}
                  </div>

                  <div
                    className={`col-span-3 text-right font-mono-tabular font-bold ${item.won ? "text-[#00E701]" : "text-[#FF2A4B]"
                      }`}
                  >
                    {item.won
                      ? `+${item.profit.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}`
                      : "No win"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TOP WINS HALL OF FAME */}
      {activeTab === "TOP" && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          <div className="px-2 py-1.5 rounded-lg bg-[#131C2E] border border-[#1E2D4A] flex items-center justify-between text-[11px] text-[#94A3B8]">
            <span>🏆 Stadium Highest Multipliers</span>
            <span className="text-[#FFB800] font-display font-bold">
              VERIFIED FAIR
            </span>
          </div>

          {INITIAL_TOP_WINS.map((win, idx) => (
            <div
              key={win.id}
              className="p-2.5 rounded-xl bg-[#131C2E]/90 border border-[#1E2D4A] hover:border-[#FFB800]/50 transition-colors flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-[#070B14]"
                    style={{ backgroundColor: win.avatarColor }}
                  >
                    #{idx + 1}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#F8FAFC]">
                      {win.username}
                    </div>
                    <div className="text-[10px] text-[#94A3B8]">{win.date}</div>
                  </div>
                </div>

                <div className="px-2.5 py-1 rounded-full bg-[#FFB800]/20 border border-[#FFB800] text-[#FFB800] font-mono-tabular font-extrabold text-xs shadow-[0_0_12px_rgba(255,184,0,0.3)]">
                  {win.multiplier.toFixed(2)}x
                </div>
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-[#1E2D4A]/60 text-[11px] font-mono-tabular">
                <span className="text-[#94A3B8]">
                  Staked: <strong className="text-[#F8FAFC]">Rs. {win.betAmount.toLocaleString("en-IN")}</strong>
                </span>
                <span className="text-[#00E701] font-bold">
                  Won: Rs. {win.winAmount.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[9px] font-mono-tabular text-[#94A3B8]/70 truncate">
                <ShieldCheck className="w-3 h-3 text-[#00E701] shrink-0" />
                <span className="truncate">SHA256: {win.roundHash}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
