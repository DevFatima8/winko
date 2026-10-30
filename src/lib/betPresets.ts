export const DEFAULT_BET_PRESETS = [10, 20, 50, 100, 200] as const;
export const MAX_BET_PRESET = 50_000;
export type BetPresetValues = [number, number, number, number, number];

const ACTIVE_USER_KEY = "wx:active-bet-preset-user";
const USER_KEY_PREFIX = "wx:bet-presets:";
const moduleInitialValues = readActiveValues();
let activeUserId: string | null = null;

export function normalizeBetPresets(value: unknown): BetPresetValues | null {
  if (!Array.isArray(value) || value.length !== 5) return null;
  const values = value.map((amount) => typeof amount === "number" ? amount : typeof amount === "string" && amount.trim() ? Number(amount) : Number.NaN);
  if (values.some((amount) => !Number.isFinite(amount) || amount < 10 || amount > MAX_BET_PRESET || Math.round(amount * 100) / 100 !== amount)) return null;
  if (new Set(values).size !== values.length) return null;
  return values as BetPresetValues;
}

function readValues(userId: string | null): BetPresetValues {
  if (typeof window === "undefined" || !userId) return [...DEFAULT_BET_PRESETS];
  const stored = window.localStorage.getItem(`${USER_KEY_PREFIX}${userId}`);
  if (!stored) return [...DEFAULT_BET_PRESETS];
  try {
    return normalizeBetPresets(JSON.parse(stored)) ?? [...DEFAULT_BET_PRESETS];
  } catch {
    return [...DEFAULT_BET_PRESETS];
  }
}

function readActiveValues() {
  if (typeof window === "undefined") return [...DEFAULT_BET_PRESETS];
  return readValues(window.localStorage.getItem(ACTIVE_USER_KEY));
}

function sameValues(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function activateBetPresets(userId: string, values: unknown) {
  const presets = normalizeBetPresets(values) ?? [...DEFAULT_BET_PRESETS];
  activeUserId = userId;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_USER_KEY, userId);
    window.localStorage.setItem(`${USER_KEY_PREFIX}${userId}`, JSON.stringify(presets));
  }
  return !sameValues(moduleInitialValues, presets);
}

export function saveBetPresets(userId: string, values: unknown) {
  const presets = normalizeBetPresets(values);
  if (!presets) throw new Error("Enter five different amounts from 10 to 50,000.");
  activeUserId = userId;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_USER_KEY, userId);
    window.localStorage.setItem(`${USER_KEY_PREFIX}${userId}`, JSON.stringify(presets));
  }
}

export const BET_PRESETS = new Proxy([...DEFAULT_BET_PRESETS] as BetPresetValues, {
  get(_target, property) {
    const values = activeUserId ? readValues(activeUserId) : readActiveValues();
    const result = Reflect.get(values, property, values);
    return typeof result === "function" ? result.bind(values) : result;
  },
}) as BetPresetValues;

export const DEFAULT_BET = DEFAULT_BET_PRESETS[0];
