"use client";

import type { Card } from "./lib/poker";

const SUIT_GLYPH: Record<Card["suit"], string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

type PlayingCardProps = {
  card?: Card | null;
  faceDown?: boolean;
  dealt?: boolean;
  delay?: number;
  highlight?: boolean;
  dim?: boolean;
};

export function PlayingCard({
  card,
  faceDown = false,
  dealt = false,
  delay = 0,
  highlight = false,
  dim = false,
}: PlayingCardProps) {
  if (!card && !dealt) {
    return <div className="card-slot" aria-hidden="true" />;
  }

  const red = card?.suit === "hearts" || card?.suit === "diamonds";

  return (
    <div
      className={[
        "playing-card",
        dealt ? "is-dealt" : "",
        faceDown ? "is-down" : "is-up",
        highlight ? "is-hot" : "",
        dim ? "is-dim" : "",
      ].join(" ")}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="card-rotator">
        <div className="card-face card-back-face">
          <img src="/images/card-back.png" alt="" />
        </div>
        <div className={`card-face card-front-face ${red ? "is-red" : "is-black"}`}>
          {card ? (
            <>
              <div className="card-index top">
                <span>{card.rank}</span>
                <span className="card-mini-suit">{SUIT_GLYPH[card.suit]}</span>
              </div>
              <div className="card-pip">{SUIT_GLYPH[card.suit]}</div>
              <div className="card-index bottom">
                <span>{card.rank}</span>
                <span className="card-mini-suit">{SUIT_GLYPH[card.suit]}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
