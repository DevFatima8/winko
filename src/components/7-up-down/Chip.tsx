"use client";

type ChipProps = {
  value: number;
  selected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
};

const COLOR_BY_VALUE: Record<number, string> = {
  1: "from-sky-500 to-sky-700",
  5: "from-rose-500 to-rose-700",
  10: "from-emerald-500 to-emerald-700",
  25: "from-violet-500 to-violet-700",
  50: "from-amber-500 to-amber-700",
  100: "from-slate-700 to-slate-900",
  500: "from-fuchsia-500 to-fuchsia-700",
  1000: "from-yellow-500 to-orange-600",
};

export default function Chip({ value, selected, onClick, size = "md" }: ChipProps) {
  const dim = size === "sm" ? "w-9 h-9 text-[11px]" : "w-12 h-12 text-sm";
  const grad = COLOR_BY_VALUE[value] ?? "from-slate-500 to-slate-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative ${dim} rounded-full bg-gradient-to-br ${grad} text-white font-bold flex items-center justify-center border-2 border-white/80 shadow-[0_4px_10px_rgba(0,0,0,0.45)] ring-2 ${
        selected ? "ring-yellow-300 scale-110" : "ring-black/20"
      } hover:scale-105 active:scale-95 transition-transform`}
      aria-label={`Select chip value ${value}`}
    >
      {/* dashed inner ring */}
      <span className="absolute inset-1 rounded-full border-2 border-dashed border-white/70 pointer-events-none" />
      <span className="relative">{value}</span>
    </button>
  );
}
