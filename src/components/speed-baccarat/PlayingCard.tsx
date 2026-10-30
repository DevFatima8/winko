import type { Card } from "./lib/baccarat";

const GLYPH: Record<Card["suit"], string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

type Props = {
  card: Card;
  faceDown?: boolean;
  order?: number;
  offset?: number;
  dim?: boolean;
  size?: "md" | "sm";
};

export default function PlayingCard({ card, faceDown = false, order = 0, offset = 0, dim = false, size = "md" }: Props) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const w = size === "md" ? "w-[clamp(36px,10.5vw,64px)] sm:w-[76px] md:w-[86px]" : "w-[clamp(32px,9vw,48px)] sm:w-[56px]";

  return (
    <div
      className={`relative aspect-[5/7.2] ${w} ${dim ? "opacity-70" : ""}`}
      style={{ marginLeft: offset ? `${offset}px` : undefined, zIndex: 10 + order }}
    >
      <div
        className={`playing-card absolute inset-0 overflow-hidden rounded-[7px] ${faceDown ? "card-back" : ""}`}
        style={{ transform: `translateY(${-offset * 0.6}px)` }}
      >
        {!faceDown && (
          <>
            {[
              { pos: "left-[3px] top-[2px] sm:left-[6px] sm:top-[4px]", flip: false },
              { pos: "right-[3px] bottom-[2px] sm:right-[6px] sm:bottom-[4px]", flip: true },
            ].map((corner) => (
              <span
                key={corner.pos}
                className={`absolute ${corner.pos} flex flex-col items-center leading-none ${
                  corner.flip ? "rotate-180" : ""
                } ${red ? "text-[#c8102e]" : "text-[#12100e]"}`}
              >
                <span className="font-display text-[11px] font-black tracking-tight sm:text-[15px]">{card.rank}</span>
                <span className="text-[9px] sm:text-[11px]">{GLYPH[card.suit]}</span>
              </span>
            ))}
            <span
              className={`absolute inset-0 flex items-center justify-center text-[22px] sm:text-[38px] ${
                red ? "text-[#c8102e]" : "text-[#12100e]"
              }`}
              style={{ textShadow: "0 1px 0 rgba(255,255,255,.7)" }}
            >
              {GLYPH[card.suit]}
            </span>
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,.55),rgba(255,255,255,0)_38%,rgba(0,0,0,.08))]" />
          </>
        )}
        {faceDown && <span className="absolute inset-[7px] rounded-[4px] border border-[rgba(231,200,119,.35)]" />}
      </div>
    </div>
  );
}

export function CardSlot({ size = "md" }: { size?: "md" | "sm" }) {
  return (
    <div
      className={`relative aspect-[5/7.2] ${
        size === "md" ? "w-[clamp(36px,10.5vw,64px)] sm:w-[76px] md:w-[86px]" : "w-[clamp(32px,9vw,48px)] sm:w-[56px]"
      } rounded-[7px] border border-dashed border-[rgba(255,240,194,.14)] bg-[rgba(0,0,0,.18)]`}
    />
  );
}

export function Hand({
  cards,
  revealed,
  thirdRevealed,
  dim = false,
  size,
}: {
  cards: Card[];
  revealed: number;
  thirdRevealed?: boolean;
  dim?: boolean;
  size?: "md" | "sm";
}) {
  return (
    <div className="flex items-end">
      {cards.map((card, i) => {
        const isThird = i >= 2;
        const shown = isThird ? thirdRevealed ?? revealed > i : revealed > i;
        return (
          <div key={card.key} className={isThird ? "ml-[-14px] sm:ml-[-18px]" : "mr-[-6px] sm:mr-[-10px]"}>
            {shown ? (
              <div className="card-in">
                <PlayingCard card={card} order={i} offset={isThird ? 12 : 0} dim={dim} size={size} />
              </div>
            ) : (
              <div className="card-in">
                <PlayingCard card={card} faceDown order={i} offset={isThird ? 12 : 0} dim={dim} size={size} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
