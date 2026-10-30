export const HISTORY_CATEGORIES = [
  { value: "games", label: "Game bets / wins / losses" },
  { value: "deposits", label: "Deposits" },
  { value: "withdrawals", label: "Withdrawals" },
  { value: "commissions", label: "Commissions" },
  { value: "login", label: "Login history" },
  { value: "support", label: "Support chats" },
  { value: "notifications", label: "Player notifications" },
  { value: "gateway", label: "Payment gateway history" },
  { value: "feedback", label: "Feedback" },
] as const;

export type HistoryCategory = typeof HISTORY_CATEGORIES[number]["value"];
export type HistorySelection = { categories: HistoryCategory[]; from?: Date; before: Date };
const isHistoryCategory = (value: string): value is HistoryCategory => HISTORY_CATEGORIES.some((category) => category.value === value);

export function parseHistorySelection(form: FormData, now = new Date()): HistorySelection {
  const scope = String(form.get("scope") ?? "");
  if (scope !== "all" && scope !== "selected") throw new Error("Choose all history or selected categories.");
  const values = form.getAll("categories").map(String);
  const categories = scope === "all" ? HISTORY_CATEGORIES.map(({ value }) => value) : [...new Set(values)];
  if (!categories.length || !categories.every(isHistoryCategory)) {
    throw new Error("Select at least one valid history category.");
  }
  const period = String(form.get("period") ?? "");
  const presets: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
  const selection: HistorySelection = { categories, before: now };
  if (period === "all") return selection;
  const count = Number(form.get("count") ?? 1);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Period quantity must be a positive whole number.");
  const days = period === "custom" ? Number(form.get("days")) : presets[period] * count;
  if (!Number.isSafeInteger(days) || days < 1 || days > 36500) throw new Error("Choose a valid period or custom days between 1 and 36500.");
  const cutoff = new Date(now.getTime() - days * 86400000);
  const direction = String(form.get("direction") ?? "");
  if (direction === "last") selection.from = cutoff;
  else if (direction === "older") selection.before = cutoff;
  else throw new Error("Choose recent history or history older than the selected period.");
  return selection;
}
