"use client";

import { SUIT_COLOR, SUIT_SYMBOL, rankLabel, type Card } from './cards';

interface PlayingCardProps {
  card?: Card;
  hidden?: boolean;
  delay?: number;
}

export default function PlayingCard({ card, hidden = false, delay = 0 }: PlayingCardProps) {
  const size = 'w-11 h-16 sm:w-16 sm:h-24 md:w-20 md:h-28';
  const style = { animationDelay: `${delay}ms` };

  if (hidden || !card) {
    return (
      <div
        className={`${size} animate-card-deal rounded-lg border-2 border-red-900 shadow-lg`}
        style={{
          ...style,
          background:
            'repeating-linear-gradient(45deg, #b91c1c 0 6px, #7f1d1d 6px 12px)',
        }}
      >
        <div className="flex h-full items-center justify-center text-2xl text-red-200/70">♛</div>
      </div>
    );
  }

  const red = SUIT_COLOR[card.suit] === 'red';
  const color = red ? 'text-red-600' : 'text-slate-900';

  return (
    <div
      className={`${size} animate-card-deal flex flex-col justify-between rounded-lg border border-slate-300 bg-white p-1.5 shadow-lg sm:p-2`}
      style={style}
    >
      <div className={`flex flex-col items-center leading-none ${color}`}>
        <span className="text-base font-extrabold sm:text-xl">{rankLabel(card.rank)}</span>
        <span className="text-sm sm:text-lg">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className={`flex flex-col items-center leading-none ${color} rotate-180`}>
        <span className="text-base font-extrabold sm:text-xl">{rankLabel(card.rank)}</span>
        <span className="text-sm sm:text-lg">{SUIT_SYMBOL[card.suit]}</span>
      </div>
    </div>
  );
}
