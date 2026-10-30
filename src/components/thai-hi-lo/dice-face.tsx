const PIP_POSITIONS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

interface DiceFaceProps {
  value: number;
  rolling?: boolean;
  size?: "sm" | "lg";
  highlight?: "win" | "lose" | null;
}

export default function DiceFace({ value, rolling = false, size = "lg", highlight = null }: DiceFaceProps) {
  const clamped = Math.min(6, Math.max(1, Math.round(value)));
  const pips = PIP_POSITIONS[clamped];

  return (
    <div
      className={[
        "hilo-dice",
        `hilo-dice--${size}`,
        rolling ? "hilo-dice--rolling" : "",
        highlight === "win" ? "hilo-dice--win" : "",
        highlight === "lose" ? "hilo-dice--lose" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`dice showing ${clamped}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={pips.includes(i + 1) ? "hilo-dice__pip hilo-dice__pip--on" : "hilo-dice__pip"}
        />
      ))}
    </div>
  );
}
