import { CHIP_VALUES, formatChip } from "../../lib/roulette";

interface ChipStyle {
  bg: string;
  inner: string;
  text: string;
  stripe: string;
}

const STYLES: Record<string, ChipStyle> = {
  "50": { bg: "#d8342b", inner: "#ea463c", text: "#ffffff", stripe: "#ffffff" },
  "100": { bg: "#141518", inner: "#25262b", text: "#f3d777", stripe: "#f3d777" },
  "200": { bg: "#1e9e4a", inner: "#2ab45a", text: "#ffffff", stripe: "#ffffff" },
  "500": { bg: "#7a3fb8", inner: "#8e52d2", text: "#ffffff", stripe: "#ffffff" },
  "1000": { bg: "#ef8a22", inner: "#ff9c38", text: "#ffffff", stripe: "#ffffff" },
};

/** Picks the style of the biggest denomination that fits into `amount`. */
export function chipStyleFor(amount: number): ChipStyle {
  let v = CHIP_VALUES[0];
  for (const c of CHIP_VALUES) if (c <= amount + 1e-9) v = c;
  return STYLES[String(v)] ?? STYLES["50"];
}

interface ChipSvgProps {
  x?: number;
  y?: number;
  r: number;
  value: number;
  label?: string;
}

/** Casino chip drawn as an SVG group centered at (x, y). */
export function ChipSvg({ x = 0, y = 0, r, value, label }: ChipSvgProps) {
  const s = chipStyleFor(value);
  const txt = label ?? formatChip(value);
  const fs = txt.length <= 2 ? r * 0.92 : txt.length === 3 ? r * 0.74 : r * 0.6;
  const ringR = r * 0.84;
  const seg = (2 * Math.PI * ringR) / 12;

  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} cy={r * 0.12} fill="#000" opacity={0.35} />
      <circle r={r} fill={s.bg} stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
      <circle r={ringR} fill="none" stroke={s.stripe} strokeWidth={r * 0.26} strokeDasharray={`${seg} ${seg}`} />
      <circle r={r * 0.62} fill={s.inner} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fs}
        fontWeight={800}
        fill={s.text}
        fontFamily="Arial, Helvetica, sans-serif"
      >
        {txt}
      </text>
    </g>
  );
}
