export type ChipDenom = 1 | 5 | 25 | 50 | 100 | 200 | 500 | 1000;

type Palette = { base: string; edge: string; text: string; ring: string };

const PALETTE: Record<ChipDenom, Palette> = {
  1: { base: "#f1eee4", edge: "#c9c3b2", text: "#1b1b1f", ring: "#8f8877" },
  5: { base: "#d8202f", edge: "#8d0d18", text: "#fff2f2", ring: "#ffd9d9" },
  25: { base: "#0f8f4c", edge: "#06542d", text: "#eafff2", ring: "#bdf7d6" },
  50: { base: "#d8202f", edge: "#8d0d18", text: "#fff2f2", ring: "#ffd9d9" },
  100: { base: "#16161d", edge: "#000004", text: "#f6e3a1", ring: "#e7c877" },
  200: { base: "#0f8f4c", edge: "#06542d", text: "#eafff2", ring: "#bdf7d6" },
  500: { base: "#6b3fd1", edge: "#391f79", text: "#f3ebff", ring: "#d9c6ff" },
  1000: { base: "#e0b64f", edge: "#8a6415", text: "#241a02", ring: "#fff2c4" },
};

export function chipColor(value: number): Palette {
  return PALETTE[(value as ChipDenom) in PALETTE ? (value as ChipDenom) : 1];
}

export function Chip({
  value,
  size = 44,
  className = "",
  style,
}: {
  value: number;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const p = chipColor(value);
  const stripes = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={style}
      aria-label={`${value} chip`}
      role="img"
    >
      <defs>
        <radialGradient id={`chipg-${value}`} cx="38%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="55%" stopColor={p.base} stopOpacity="1" />
          <stop offset="100%" stopColor={p.edge} stopOpacity="1" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#chipg-${value})`} stroke={p.edge} strokeWidth="2" />
      {stripes.map((a) => (
        <rect
          key={a}
          x="46.5"
          y="1.5"
          width="7"
          height="14"
          rx="2"
          fill={p.ring}
          opacity="0.92"
          transform={`rotate(${a} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="33" fill="none" stroke={p.ring} strokeWidth="1.6" opacity="0.75" />
      <circle cx="50" cy="50" r="29.5" fill={p.base} stroke={p.edge} strokeWidth="1.5" />
      <text
        x="50"
        y="57"
        textAnchor="middle"
        fill={p.text}
        fontFamily="'JetBrains Mono', monospace"
        fontSize={value >= 1000 ? 21 : 25}
        fontWeight="700"
      >
        {value >= 1000 ? `${value / 1000}K` : value}
      </text>
    </svg>
  );
}

/** Greedy chip breakdown (1000/500/100/25/5/1) — max stack length capped for readability. */
export function breakdown(amount: number): number[] {
  const denoms: number[] = [1000, 500, 100, 25, 5, 1];
  const out: number[] = [];
  let left = Math.round(amount * 100) / 100;
  for (const d of denoms) {
    while (left >= d && out.length < 9) {
      out.push(d);
      left = Math.round((left - d) * 100) / 100;
    }
  }
  while (left >= 1 && out.length < 11) {
    out.push(1);
    left -= 1;
  }
  return out;
}

export function ChipStack({ amount, size = 30 }: { amount: number; size?: number }) {
  const chips = breakdown(amount);
  return (
    <div className="relative" style={{ width: size, height: size + chips.length * 4 }}>
      {chips.map((d, i) => (
        <div
          key={i}
          className="chip-drop absolute left-0"
          style={{
            bottom: i * 4,
            zIndex: i,
            animationDelay: `${i * 45}ms`,
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,.6))",
            transform: `translateX(${i % 2 === 0 ? 0 : 1.5}px) rotate(${(i % 3) * 6 - 6}deg)`,
          }}
        >
          <Chip value={d} size={size} />
        </div>
      ))}
    </div>
  );
}
