'use client';

import React from 'react';
import { Card, Suit } from '../types';

interface PlayingCardProps {
  card?: Card | null;
  empty?: boolean;
  emptyLabel?: string;
  isWinning?: boolean;
  size?: 'sm' | 'md' | 'lg';
  isFlipping?: boolean;
}

export function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case 'SPADE':
      return '♠';
    case 'HEART':
      return '♥';
    case 'CLUB':
      return '♣';
    case 'DIAMOND':
      return '♦';
  }
}

export function getSuitColorClass(suit: Suit): string {
  return suit === 'HEART' || suit === 'DIAMOND' ? 'text-red-600' : 'text-slate-900';
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  empty = false,
  emptyLabel,
  isWinning = false,
  size = 'md',
  isFlipping = false,
}) => {
  const sizeClasses = {
    sm: 'w-10 h-14 text-xs',
    md: 'w-14 h-20 text-sm',
    lg: 'w-20 h-28 text-base',
  }[size];

  if (empty || !card) {
    return (
      <div
        className={`${sizeClasses} rounded-lg border-2 border-dashed border-amber-400/30 bg-black/40 flex flex-col items-center justify-center text-amber-200/40 select-none shadow-inner`}
      >
        {emptyLabel && <span className="text-[10px] font-bold tracking-wider">{emptyLabel}</span>}
      </div>
    );
  }

  const isRed = card.color === 'RED';
  const suitSymbol = getSuitSymbol(card.suit);

  return (
    <div
      className={`relative ${sizeClasses} rounded-lg bg-gradient-to-br from-white via-slate-50 to-slate-200 shadow-md border ${
        isWinning
          ? 'border-amber-400 ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900 scale-105 shadow-amber-400/40'
          : 'border-slate-300'
      } flex flex-col justify-between p-1 select-none transform transition-all duration-300 ${
        isFlipping ? 'animate-bounce' : ''
      }`}
    >
      {/* Top Left Rank & Suit */}
      <div className={`flex flex-col items-center leading-none ${isRed ? 'text-red-600' : 'text-slate-950'}`}>
        <span className="font-extrabold text-xs leading-none">{card.rank}</span>
        <span className="text-xs leading-none">{suitSymbol}</span>
      </div>

      {/* Center Big Suit */}
      <div
        className={`absolute inset-0 flex items-center justify-center font-bold pointer-events-none opacity-85 ${
          isRed ? 'text-red-600' : 'text-slate-950'
        } ${size === 'sm' ? 'text-xl' : size === 'md' ? 'text-3xl' : 'text-4xl'}`}
      >
        {suitSymbol}
      </div>

      {/* Bottom Right Rank & Suit (upside down) */}
      <div
        className={`flex flex-col items-center leading-none rotate-180 self-end ${
          isRed ? 'text-red-600' : 'text-slate-950'
        }`}
      >
        <span className="font-extrabold text-xs leading-none">{card.rank}</span>
        <span className="text-xs leading-none">{suitSymbol}</span>
      </div>

      {/* Points indicator tag */}
      <div className="absolute -top-1 -right-1 bg-amber-500 text-black text-[9px] font-black rounded-full px-1 shadow border border-amber-300">
        +{card.value}
      </div>
    </div>
  );
};
