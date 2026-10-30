const THEMES: Record<number, string> = {
  10: "chip-gray",
  200: "chip-gray",
  50: "chip-red",
  100: "chip-blue",
  500: "chip-green",
  1000: "chip-gold",
};

interface ChipProps {
  value: number;
  onClick: () => void;
  disabled?: boolean;
}

export default function Chip({ value, onClick, disabled = false }: ChipProps) {
  return (
    <button
      type="button"
      className={`chip ${THEMES[value] ?? "chip-gray"}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Add Rs. ${value} bet`}
    >
      <span className="chip-value">Rs. {value}</span>
    </button>
  );
}
