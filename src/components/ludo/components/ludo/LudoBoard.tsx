"use client";

import {
  ARROW_INDICES,
  BLOCK_INDICES,
  CHANCE_INDICES,
  COLOR_META,
  HOME_COORDS,
  OUTER_PATH,
  PLAYER_COLOR,
  START_INDEX,
  STAR_INDICES,
  cellStyle,
  coordsForToken,
  tokenCenter,
  type PieceColor,
  type TokenState,
} from "@/lib/ludo";

function StarIcon() {
  return (
    <svg className="cell-star" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.6l2.7 6.1 6.6.6-5 4.5 1.5 6.5L12 16.8 6.2 20.3 7.7 13.8 2.7 9.3l6.6-.6L12 2.6z" />
    </svg>
  );
}

function ArrowIcon({ rotate }: { rotate: number }) {
  return (
    <svg className="cell-arrow" viewBox="0 0 24 24" fill="currentColor" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M4 13h10.6l-3.3 3.3 1.4 1.4L20 12l-7.3-5.7-1.4 1.4L14.6 11H4v2z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="cell-pin" viewBox="0 0 24 24">
      <path fill="#e53935" d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7z" />
      <circle cx="12" cy="9" r="2.4" fill="#fff" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg className="cell-block" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#e53935" strokeWidth="2.4" />
      <path d="M6.2 6.2l11.6 11.6" stroke="#e53935" strokeWidth="2.4" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg className="cell-bag" viewBox="0 0 64 64">
      <path fill="#e0b000" d="M20 24c0-8 6-14 12-14s12 6 12 14c6 2 10 8 10 16 0 10-8 20-22 20S10 50 10 40c0-8 4-14 10-16z" />
      <path fill="#8a5a18" d="M26 22c2-6 10-6 12 0l4 6h-20l4-6z" />
      <text x="32" y="46" textAnchor="middle" fontSize="16" fontWeight="800" fill="#7a4a00">
        $
      </text>
    </svg>
  );
}

const ARROW_ROT: Record<number, number> = {
  2: -90,
  11: 0,
  15: 0,
  24: 90,
  28: 90,
  37: 180,
  41: 180,
  50: -90,
};

function startClass(index: number) {
  if (index === START_INDEX[0]) return "start-yellow";
  if (index === START_INDEX[1]) return "start-green";
  if (index === START_INDEX[2]) return "start-red";
  if (index === START_INDEX[3]) return "start-blue";
  return "";
}

function Pawn({
  color,
  glow,
  left,
  top,
  offset,
  z,
}: {
  color: PieceColor;
  glow?: boolean;
  left: string;
  top: string;
  offset: number;
  z: number;
}) {
  const meta = COLOR_META[color];
  return (
    <div
      className={`pawn ${glow ? "glow" : ""}`}
      style={{
        left,
        top,
        transform: `translate(calc(-50% + ${offset}px), calc(-72% - ${offset}px))`,
        zIndex: z,
      }}
    >
      <div
        className="pawn-base"
        style={{ background: `radial-gradient(circle at 40% 40%, ${meta.light}, ${meta.dark})` }}
      />
      <div
        className="pawn-body"
        style={{
          background: `linear-gradient(160deg, ${meta.light}, ${meta.main} 45%, ${meta.dark})`,
        }}
      />
      <div
        className="pawn-head"
        style={{
          background: `radial-gradient(circle at 35% 30%, #fff 0%, ${meta.main} 42%, ${meta.dark} 100%)`,
        }}
      />
    </div>
  );
}

export default function LudoBoard({
  tokens,
  bags,
  moving,
}: {
  tokens: TokenState[][];
  bags: number[];
  moving?: { player: number; token: number } | null;
}) {
  return (
    <div className="ludo-board">
      <div className="yard red">
        <div className="yard-slots">
          <i className="yard-slot" />
          <i className="yard-slot" />
          <i className="yard-slot" />
          <i className="yard-slot" />
        </div>
      </div>
      <div className="yard green">
        <div className="yard-slots">
          <i className="yard-slot" />
          <i className="yard-slot" />
          <i className="yard-slot" />
          <i className="yard-slot" />
        </div>
      </div>
      <div className="yard yellow">
        <div className="yard-slots">
          <i className="yard-slot" />
          <i className="yard-slot" />
          <i className="yard-slot" />
          <i className="yard-slot" />
        </div>
      </div>
      <div className="yard blue">
        <div className="yard-slots">
          <i className="yard-slot" />
          <i className="yard-slot" />
          <i className="yard-slot" />
          <i className="yard-slot" />
        </div>
      </div>

      {OUTER_PATH.map((pos, index) => {
        const cls = ["path-cell", startClass(index)].filter(Boolean).join(" ");
        return (
          <div key={`p-${index}`} className={cls} style={cellStyle(pos[0], pos[1])}>
            {STAR_INDICES.includes(index) ? <StarIcon /> : null}
            {ARROW_INDICES.includes(index) ? <ArrowIcon rotate={ARROW_ROT[index] ?? 0} /> : null}
            {CHANCE_INDICES.includes(index) ? <PinIcon /> : null}
            {BLOCK_INDICES.includes(index) ? <BlockIcon /> : null}
            {bags.includes(index) ? <BagIcon /> : null}
          </div>
        );
      })}

      {HOME_COORDS.map((home, player) =>
        home.map((pos, i) => (
          <div
            key={`h-${player}-${i}`}
            className={`path-cell home-${PLAYER_COLOR[player]}`}
            style={cellStyle(pos[0], pos[1])}
          >
            {i === 0 || i === 2 ? <ArrowIcon rotate={[-90, 180, 90, 0][player]} /> : null}
          </div>
        )),
      )}

      <div className="home-center">
        <div className="tri tri-red" />
        <div className="tri tri-green" />
        <div className="tri tri-yellow" />
        <div className="tri tri-blue" />
        <div className="home-logo">
          <img src="/images/center-emblem.png" alt="" />
        </div>
      </div>

      {tokens.map((group, player) =>
        group.map((tok, token) => {
          const c = coordsForToken(player, token, tok.steps);
          const pos = tokenCenter(c.row, c.col);
          const stackOffset =
            group.filter((other, oi) => oi < token && other.steps === tok.steps).length * 6;
          return (
            <Pawn
              key={`t-${player}-${token}`}
              color={PLAYER_COLOR[player]}
              glow={Boolean(moving && moving.player === player && moving.token === token)}
              left={pos.left}
              top={pos.top}
              offset={stackOffset}
              z={moving && moving.player === player && moving.token === token ? 8 : 5}
            />
          );
        }),
      )}
    </div>
  );
}
