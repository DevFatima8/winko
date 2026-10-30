"use client";

export default function Dice({
  value,
  rolling,
  onClick,
}: {
  value: number;
  rolling: boolean;
  onClick?: () => void;
}) {
  const shown = rolling ? ((value % 6) + 1) : Math.min(6, Math.max(1, value || 1));
  return (
    <button
      type="button"
      className={`dice ${rolling ? "rolling" : ""}`}
      data-v={shown}
      onClick={onClick}
      aria-label={`Dice ${shown}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="pip" />
      ))}
    </button>
  );
}
