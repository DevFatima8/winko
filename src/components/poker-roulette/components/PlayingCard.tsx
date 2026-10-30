"use client";

import { SUIT_SYMBOL, rankLabel, type CardData } from "../lib/poker";

interface PlayingCardProps {
  card: CardData;
  revealed: boolean;
  flipDelay?: number; // ms — stagger the flip like a real dealer
  className?: string;
}

export default function PlayingCard({ card, revealed, flipDelay = 0, className = "" }: PlayingCardProps) {
  const red = card.suit === 1 || card.suit === 2;

  return (
    <div className={`card-scene ${className}`} style={{ animationDelay: `${flipDelay}ms` }}>
      <div className={`card-inner ${revealed ? "is-revealed" : ""}`} style={{ transitionDelay: `${flipDelay}ms` }}>
        <div className="card-face card-back" aria-hidden="true">
          <div className="card-back-frame">
            <span className="card-back-suit">♠</span>
          </div>
        </div>
        <div className={`card-face card-front ${red ? "is-red" : "is-black"}`}>
          <div className="card-corner card-corner-tl">
            <span className="card-rank">{rankLabel(card.rank)}</span>
            <span className="card-suit-sm">{SUIT_SYMBOL[card.suit]}</span>
          </div>
          <div className="card-pip">{SUIT_SYMBOL[card.suit]}</div>
          <div className="card-corner card-corner-br">
            <span className="card-rank">{rankLabel(card.rank)}</span>
            <span className="card-suit-sm">{SUIT_SYMBOL[card.suit]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
