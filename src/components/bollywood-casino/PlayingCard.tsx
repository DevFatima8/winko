import type { CardT } from "./lib/engine";

export type CardVariant = "m" | "j";

interface Props {
  card: CardT;
  revealed: boolean;
  variant?: CardVariant;
  point?: boolean;
}

export default function PlayingCard({ card, revealed, variant = "m", point = false }: Props) {
  return (
    <div className={`p3d pc-${variant} ${point ? "pc-point" : ""}`}>
      <div className={`card-inner ${revealed ? "is-revealed" : ""}`}>
        <div className={`card-face ${card.red ? "red" : "black"}`}>
          <div className="cf-corner cf-tl">
            <span className="cf-rank">{card.rank}</span>
            <span className="cf-suit">{card.glyph}</span>
          </div>
          <div className="cf-center">
            <span>{card.glyph}</span>
          </div>
          <div className="cf-corner cf-br">
            <span className="cf-rank">{card.rank}</span>
            <span className="cf-suit">{card.glyph}</span>
          </div>
        </div>
        <div className="card-back">
          <div className="card-back-diamond">
            <span>BC</span>
          </div>
        </div>
      </div>
    </div>
  );
}
