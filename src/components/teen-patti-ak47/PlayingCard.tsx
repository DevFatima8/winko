import { Card, RANK_LABELS, SUIT_SYMBOLS, isWild } from "./lib/teenpatti";

interface PlayingCardProps {
  card: Card;
  faceUp: boolean;
  dealt: boolean;
  /** Stagger delay (ms) for the deal-in and flip animations. */
  delay: number;
  /** Gold pulsing glow for the winning hand. */
  glow?: boolean;
}

export default function PlayingCard({ card, faceUp, dealt, delay, glow = false }: PlayingCardProps) {
  const rankLabel = RANK_LABELS[card.rank - 2];
  const suit = SUIT_SYMBOLS[card.suit];
  const red = card.suit === 1 || card.suit === 2;
  const wild = isWild(card);

  return (
    <div className={`pc${glow ? " glow" : ""}`}>
      <div className={`pc-deal${dealt ? " in" : ""}`} style={{ transitionDelay: `${delay}ms` }}>
        <div className="pc-scene">
          <div
            className={`pc-inner${faceUp ? " flipped" : ""}`}
            style={{ transitionDelay: `${delay}ms` }}
          >
            <div className="pc-face pc-back">
              <span>AK47</span>
            </div>
            <div className={`pc-face pc-front${red ? " red" : " black"}${wild ? " wild" : ""}`}>
              <div className="pc-corner tl">
                <b>{rankLabel}</b>
                <i>{suit}</i>
              </div>
              <div className="pc-center">{suit}</div>
              <div className="pc-corner br">
                <b>{rankLabel}</b>
                <i>{suit}</i>
              </div>
              {wild && <div className="pc-wildtag">WILD</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
