"use client";

type ChipButtonProps = {
  value: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
};

const CHIP_THEME: Record<number, { bg: string; dark: string; label: string }> = {
  5: { bg: "#c81e3a", dark: "#7a1022", label: "5" },
  25: { bg: "#147a43", dark: "#0b4a28", label: "25" },
  50: { bg: "#c81e3a", dark: "#7a1022", label: "50" },
  100: { bg: "#1c1c1c", dark: "#050505", label: "100" },
  200: { bg: "#147a43", dark: "#0b4a28", label: "200" },
  500: { bg: "#6b2fa0", dark: "#3b1760", label: "500" },
  1000: { bg: "#c9a227", dark: "#7a5f10", label: "1K" },
};

export function ChipButton({ value, selected, disabled, onClick }: ChipButtonProps) {
  const theme = CHIP_THEME[value] ?? CHIP_THEME[5]!;
  return (
    <button
      type="button"
      className={`chip-btn ${selected ? "is-selected" : ""}`}
      style={{
        background: `radial-gradient(circle at 35% 30%, ${theme.bg}, ${theme.dark})`,
        ["--chip-dark" as string]: theme.dark,
      }}
      disabled={disabled}
      onClick={onClick}
      aria-label={`Select ${value} chip`}
    >
      <span className="chip-ring" />
      <span className="chip-core">{theme.label}</span>
    </button>
  );
}

export function MiniChip({ value }: { value: number }) {
  const theme = CHIP_THEME[value] ?? CHIP_THEME[5]!;
  return (
    <span
      className="mini-chip"
      style={{
        background: `radial-gradient(circle at 35% 30%, ${theme.bg}, ${theme.dark})`,
      }}
    >
      {theme.label}
    </span>
  );
}
