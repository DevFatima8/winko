'use client';

import React from 'react';
import { BookOpen, Sliders, Volume2, VolumeX, Wallet, Maximize2 } from 'lucide-react';

interface CasinoHeaderProps {
  balance: number;
  liability: number;
  netProfit: number;
  isMuted: boolean;
  winRatio: number;
  onToggleMute: () => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
}

export const CasinoHeader: React.FC<CasinoHeaderProps> = ({
  balance,
  liability,
  isMuted,
  onToggleMute,
  onOpenRules,
  onOpenSettings,
}) => {
  const toggleFullscreen = () => {
    if (typeof document !== 'undefined') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
      } else {
        document.exitFullscreen().catch(() => { });
      }
    }
  };

  return (
    <header className="w-full bg-slate-950/90 backdrop-blur-md border-b border-amber-500/20 px-3 sm:px-6 py-2.5 sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand / Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-amber-600 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/30 border border-amber-300">
              <span className="text-xl">👑</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 tracking-wider">
                  RACE 20-20
                </h1>
                <span className="bg-red-600 text-white font-extrabold text-[10px] px-1.5 py-0.5 rounded tracking-wide animate-pulse">
                  LIVE
                </span>
              </div>
              <span className="text-[10px] text-amber-300/70 font-mono tracking-widest uppercase">
                4-KINGS CASINO EXCHANGE
              </span>
            </div>
          </div>
        </div>

        {/* Player Wallet & Exposure Stats */}
        <div className="flex items-center gap-2 sm:gap-4 font-mono">
          {/* Main Balance */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-inner">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase leading-none">BALANCE</span>
              <span className="text-xs sm:text-sm font-black text-emerald-400 leading-tight">
                Rs. {balance.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Exposure / Liability */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase leading-none">EXPOSURE</span>
              <span className={`text-xs sm:text-sm font-black leading-tight ${liability > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                Rs. {liability.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions (Rules, Settings, Audio, Fullscreen) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Rules Button */}
          <button
            onClick={onOpenRules}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-slate-200 hover:text-amber-300 transition-colors"
            title="Rules & Guide"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Rules</span>
          </button>

          {/* Settings & Ratio badge */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-xs font-bold text-amber-300 transition-colors"
            title="Game settings"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/30">
              Settings
            </span>
          </button>

          {/* Audio toggle */}
          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-colors"
            title={isMuted ? 'Unmute SFX' : 'Mute SFX'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="hidden sm:inline-flex p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-colors"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
