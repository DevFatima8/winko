"use client";

import { useMemo, useState } from "react";
import { GRID_COLS, GRID_ROWS, MULTIPLIERS, SPOTS, colorOf, numberAt, type BetMap } from "../../lib/roulette";
import { ChipSvg } from "./Chip";

const CW = 92;
const CH = 72;
const X0 = 14;
const Y0 = 14;
const Z = 18; // size of split / corner hit zones
const CHIP_R = 17;
const GRID_W = CW * GRID_COLS;
const GRID_H = CH * GRID_ROWS;
const COL_X = X0 + GRID_W;
const COL_W = 74;
const OUT1_Y = Y0 + GRID_H;
const OUT_H = 58;
const OUT2_Y = OUT1_Y + OUT_H;
const VB_W = COL_X + COL_W + 14;
const VB_H = OUT2_Y + OUT_H + 14;

const RED = "#d7263d";
const BLACK = "#1c1d21";
const LINE = "rgba(255,255,255,0.88)";
const FONT = "Arial, Helvetica, sans-serif";

interface Zone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clickable areas, bottom-most first (straight cells) to top-most (corners). */
function buildZones(): Zone[] {
  const z: Zone[] = [];
  for (let c = 0; c < GRID_COLS; c++)
    for (let r = 0; r < GRID_ROWS; r++)
      z.push({ id: `s-${numberAt(c, r)}`, x: X0 + c * CW, y: Y0 + r * CH, w: CW, h: CH });
  for (let r = 0; r < GRID_ROWS; r++) z.push({ id: `col-${r}`, x: COL_X, y: Y0 + r * CH, w: COL_W, h: CH });
  z.push({ id: "low", x: X0, y: OUT1_Y, w: 2 * CW, h: OUT_H });
  z.push({ id: "high", x: X0 + 2 * CW, y: OUT1_Y, w: 2 * CW, h: OUT_H });
  (["even", "red", "black", "odd"] as const).forEach((id, k) =>
    z.push({ id, x: X0 + k * CW, y: OUT2_Y, w: CW, h: OUT_H }),
  );
  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const n = numberAt(c, r);
      if (c < GRID_COLS - 1)
        z.push({
          id: `sp-${n}-${numberAt(c + 1, r)}`,
          x: X0 + (c + 1) * CW - Z / 2,
          y: Y0 + r * CH + Z / 2,
          w: Z,
          h: CH - Z,
        });
      if (r < GRID_ROWS - 1)
        z.push({
          id: `sp-${numberAt(c, r + 1)}-${n}`,
          x: X0 + c * CW + Z / 2,
          y: Y0 + (r + 1) * CH - Z / 2,
          w: CW - Z,
          h: Z,
        });
    }
  }
  for (let c = 0; c < GRID_COLS; c++)
    z.push({ id: `st-${c}`, x: X0 + c * CW + Z / 2, y: OUT1_Y - Z / 2, w: CW - Z, h: Z });
  for (let c = 0; c < GRID_COLS - 1; c++) {
    for (let r = 0; r < GRID_ROWS - 1; r++) {
      const nums = [numberAt(c, r), numberAt(c, r + 1), numberAt(c + 1, r), numberAt(c + 1, r + 1)].sort(
        (a, b) => a - b,
      );
      z.push({ id: `c-${nums.join("-")}`, x: X0 + (c + 1) * CW - Z / 2, y: Y0 + (r + 1) * CH - Z / 2, w: Z, h: Z });
    }
  }
  return z;
}

const ZONES = buildZones();
const POS: Record<string, { x: number; y: number }> = Object.fromEntries(
  ZONES.map((z) => [z.id, { x: z.x + z.w / 2, y: z.y + z.h / 2 }]),
);
const INSIDE_TYPES = new Set(["straight", "split", "street", "corner"]);

interface CellDef {
  n: number;
  x: number;
  y: number;
}
const CELLS: CellDef[] = [];
for (let c = 0; c < GRID_COLS; c++)
  for (let r = 0; r < GRID_ROWS; r++) CELLS.push({ n: numberAt(c, r), x: X0 + c * CW, y: Y0 + r * CH });

function OutsideCell({
  x,
  y,
  w,
  h,
  label,
  fill = "rgba(0,0,0,0.14)",
  mult,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  fill?: string;
  mult: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={LINE} strokeWidth={2} />
      <text
        x={x + w / 2}
        y={y + h / 2 - 7}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={19}
        fontWeight={800}
        fill="#fff"
        fontFamily={FONT}
        letterSpacing={0.5}
      >
        {label}
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 14}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        fill="rgba(255,255,255,0.75)"
        fontFamily={FONT}
      >
        {mult}x
      </text>
    </g>
  );
}

interface Props {
  bets: BetMap;
  disabled?: boolean;
  onPlace: (spotId: string) => void;
  winningNumber: number | null;
  winningSpots: ReadonlySet<string>;
}

export function BettingTable({ bets, disabled, onPlace, winningNumber, winningSpots }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const hoverSpot = hover ? SPOTS[hover] : undefined;
  const hoverNums = useMemo(() => new Set(hoverSpot?.numbers ?? []), [hoverSpot]);
  const chips = useMemo(() => Object.entries(bets).filter(([, a]) => a > 0), [bets]);
  const showResult = winningNumber !== null;
  const winCell = showResult ? CELLS.find((c) => c.n === winningNumber) : undefined;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label="Roulette betting table"
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <radialGradient id="mr-felt" cx="50%" cy="30%" r="85%">
          <stop offset="0" stopColor="#1b8f55" />
          <stop offset="0.55" stopColor="#0f6b3e" />
          <stop offset="1" stopColor="#0a482a" />
        </radialGradient>
        <filter id="mr-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={1} y={1} width={VB_W - 2} height={VB_H - 2} rx={12} fill="url(#mr-felt)" stroke="#b8860b" strokeWidth={2} />

      {/* Number cells */}
      {CELLS.map(({ n, x, y }) => (
        <g key={n}>
          <rect x={x} y={y} width={CW} height={CH} fill={colorOf(n) === "red" ? RED : BLACK} stroke={LINE} strokeWidth={2} />
          <text
            x={x + CW / 2}
            y={y + CH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={30}
            fontWeight={700}
            fill="#fff"
            fontFamily={FONT}
          >
            {n}
          </text>
          {hoverNums.has(n) && !disabled && (
            <rect x={x} y={y} width={CW} height={CH} fill="#fff" opacity={0.3} pointerEvents="none" />
          )}
        </g>
      ))}

      {/* Column cells */}
      {Array.from({ length: GRID_ROWS }).map((_, r) => (
        <g key={r}>
          <rect x={COL_X} y={Y0 + r * CH} width={COL_W} height={CH} fill="rgba(0,0,0,0.14)" stroke={LINE} strokeWidth={2} />
          <text
            x={COL_X + COL_W / 2}
            y={Y0 + r * CH + CH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={17}
            fontWeight={800}
            fill="#fff"
            fontFamily={FONT}
          >
            {MULTIPLIERS.column}x
          </text>
        </g>
      ))}

      {/* Outside bets */}
      <OutsideCell x={X0} y={OUT1_Y} w={2 * CW} h={OUT_H} label="1-6" mult={MULTIPLIERS.low} />
      <OutsideCell x={X0 + 2 * CW} y={OUT1_Y} w={2 * CW} h={OUT_H} label="7-12" mult={MULTIPLIERS.high} />
      <OutsideCell x={X0} y={OUT2_Y} w={CW} h={OUT_H} label="EVEN" mult={MULTIPLIERS.even} />
      <OutsideCell x={X0 + CW} y={OUT2_Y} w={CW} h={OUT_H} label="RED" fill={RED} mult={MULTIPLIERS.red} />
      <OutsideCell x={X0 + 2 * CW} y={OUT2_Y} w={CW} h={OUT_H} label="BLACK" fill={BLACK} mult={MULTIPLIERS.black} />
      <OutsideCell x={X0 + 3 * CW} y={OUT2_Y} w={CW} h={OUT_H} label="ODD" mult={MULTIPLIERS.odd} />

      {/* Winning number highlight */}
      {winCell && (
        <rect
          x={winCell.x}
          y={winCell.y}
          width={CW}
          height={CH}
          fill="none"
          stroke="#f6dd8a"
          strokeWidth={5}
          className="win-pulse"
          pointerEvents="none"
        />
      )}

      {/* Hit zones */}
      {ZONES.map((z) => {
        const spot = SPOTS[z.id];
        const isOutside = spot ? !INSIDE_TYPES.has(spot.type) : false;
        const active = hover === z.id && !disabled;
        return (
          <rect
            key={z.id}
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            fill="#fff"
            fillOpacity={active && isOutside ? 0.22 : 0}
            style={{ cursor: disabled ? "not-allowed" : "pointer" }}
            onMouseEnter={() => setHover(z.id)}
            onMouseLeave={() => setHover((h) => (h === z.id ? null : h))}
            onClick={() => {
              if (disabled) return;
              onPlace(z.id);
              setHover(null);
            }}
          >
            <title>{spot?.label ?? z.id}</title>
          </rect>
        );
      })}

      {/* Chips */}
      {chips.map(([id, amount]) => {
        const p = POS[id];
        if (!p) return null;
        const won = winningSpots.has(id);
        const lost = showResult && !won;
        return (
          <g key={`${id}-${amount}`} transform={`translate(${p.x} ${p.y})`} pointerEvents="none" opacity={lost ? 0.35 : 1}>
            {won && (
              <circle r={CHIP_R + 5} fill="none" stroke="#f6dd8a" strokeWidth={3} className="win-pulse" filter="url(#mr-glow)" />
            )}
            <g className="chip-pop">
              <ChipSvg r={CHIP_R} value={amount} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
