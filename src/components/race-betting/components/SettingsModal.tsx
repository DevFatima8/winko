'use client';

import React from 'react';
import { X, Sliders, Volume2, VolumeX, Flame } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  turboMode: boolean;
  onToggleTurbo: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onResetStats: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  turboMode,
  onToggleTurbo,
  isMuted,
  onToggleMute,
  onResetStats,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-black text-white uppercase tracking-wider">
              GAME SETTINGS
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 text-xs sm:text-sm text-slate-300 max-h-[80vh] overflow-y-auto">
          {/* Gameplay Options */}
          <div className="space-y-3 pt-1">
            {/* Turbo Mode Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2">
                <Flame className={`w-5 h-5 ${turboMode ? 'text-amber-400' : 'text-slate-500'}`} />
                <div>
                  <div className="font-bold text-white text-xs sm:text-sm">Turbo Deal Speed</div>
                  <div className="text-[11px] text-slate-400">Fast 0.4s card animation instead of 1.1s</div>
                </div>
              </div>
              <button
                onClick={onToggleTurbo}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${turboMode ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${turboMode ? 'translate-x-6' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

            {/* Sound Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2">
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-rose-400" />
                ) : (
                  <Volume2 className="w-5 h-5 text-emerald-400" />
                )}
                <div>
                  <div className="font-bold text-white text-xs sm:text-sm">Casino Audio Effects</div>
                  <div className="text-[11px] text-slate-400">Card flips, chip clinks, victory jingles</div>
                </div>
              </div>
              <button
                onClick={onToggleMute}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${!isMuted ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${!isMuted ? 'translate-x-6' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={onResetStats}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-colors"
            >
              Reset Session Stats
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
