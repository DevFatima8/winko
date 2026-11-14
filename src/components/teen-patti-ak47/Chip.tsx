const THEMES: Record<number, string> = {
  10: "ak47-chip-gray",
  200: "ak47-chip-gray",
  50: "ak47-chip-red",
  100: "ak47-chip-blue",
  500: "ak47-chip-green",
  1000: "ak47-chip-gold",
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
      className={`ak47-chip ${THEMES[value] ?? "ak47-chip-gray"}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Add Rs. ${value} bet`}
    >
      <span className="ak47-chip-currency">Rs.</span>
      <span className={`ak47-chip-value${String(value).length > 6 ? " ak47-chip-value-long" : ""}`}>{value}</span>
    </button>
  );
}
