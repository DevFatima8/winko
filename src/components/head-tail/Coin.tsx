import { useId } from "react";
import type { Side } from "./lib/game";

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const STAR = starPoints(100, 84, 34, 14);

function renderGlyph(side: Side, fill: string, dx: number, dy: number) {
  return (
    <g transform={`translate(${dx} ${dy})`} fill={fill}>
      {side === "head" ? (
        <>
          <path d="M66 96 L58 60 L82 78 L100 50 L118 78 L142 60 L134 96 Z" />
          <rect x="68" y="100" width="64" height="9" rx="3" />
          <circle cx="58" cy="57" r="5" />
          <circle cx="100" cy="46" r="5" />
          <circle cx="142" cy="57" r="5" />
        </>
      ) : (
        <polygon points={STAR} />
      )}
      <text
        x="101.5"
        y="150"
        textAnchor="middle"
        fontSize="28"
        fontWeight="900"
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="3"
      >
        {side === "head" ? "HEAD" : "TAIL"}
      </text>
    </g>
  );
}

export function CoinFace({
  side,
  className,
}: {
  side: Side;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rim = `rim${uid}`;
  const face = `face${uid}`;

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={side === "head" ? "Head side of coin" : "Tail side of coin"}
    >
      <defs>
        <radialGradient id={rim} cx="32%" cy="28%" r="85%">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#f7b500" />
          <stop offset="1" stopColor="#9a5b00" />
        </radialGradient>
        <radialGradient id={face} cx="45%" cy="35%" r="75%">
          <stop offset="0" stopColor="#ffe27a" />
          <stop offset="0.6" stopColor="#f2a90a" />
          <stop offset="1" stopColor="#c47c00" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="99" fill={`url(#${rim})`} />
      <circle
        cx="100"
        cy="100"
        r="91"
        fill="none"
        stroke="#7a4700"
        strokeOpacity="0.55"
        strokeWidth="2.4"
        strokeDasharray="1.5 5.5"
        strokeLinecap="round"
      />
      <circle
        cx="100"
        cy="100"
        r="82"
        fill={`url(#${face})`}
        stroke="#a86a00"
        strokeWidth="2"
      />
      <circle
        cx="100"
        cy="100"
        r="75"
        fill="none"
        stroke="#fff3b0"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      {renderGlyph(side, "#fff1a6", 1.6, 1.8)}
      {renderGlyph(side, "#7a4700", 0, 0)}
      <path
        d="M30 70 A80 80 0 0 1 120 22"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const EDGE_LAYERS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

type CoinProps = {
  rotation: number;
  durationMs: number;
  tossing: boolean;
};

export function Coin({ rotation, durationMs, tossing }: CoinProps) {
  return (
    <div className="coin-stage">
      <div
        className="coin-shadow"
        style={{
          animation: tossing
            ? `ht-shadow-toss ${durationMs}ms cubic-bezier(0.3, 0.6, 0.3, 1) both`
            : "none",
        }}
      />
      <div
        className="coin-toss"
        style={{
          animation: tossing
            ? `ht-toss ${durationMs}ms cubic-bezier(0.3, 0.6, 0.3, 1) both`
            : "none",
        }}
      >
        <div
          className="ht-coin"
          style={{
            transform: `rotateX(${rotation}deg)`,
            transition: `transform ${durationMs}ms cubic-bezier(0.2, 0.6, 0.25, 1)`,
          }}
        >
          <div
            className="coin-face"
            style={{ transform: "translateZ(5px)" }}
          >
            <CoinFace side="head" className="h-full w-full" />
          </div>
          {EDGE_LAYERS.map((z) => (
            <div
              key={z}
              className="coin-edge"
              style={{ transform: `translateZ(${z}px)` }}
            />
          ))}
          <div
            className="coin-face"
            style={{ transform: "rotateX(180deg) translateZ(5px)" }}
          >
            <CoinFace side="tail" className="h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
