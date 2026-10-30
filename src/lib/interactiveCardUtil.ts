import { randomInt } from "node:crypto";
import { InteractiveMoveError } from "./browserCardInteractiveGames";

/** Cryptographic uniform float in [0, 1) for shared client engines that accept an rng. */
export const secureRandom = () => randomInt(0, 2 ** 47) / 2 ** 47;

export function pick<T>(items: readonly T[]): T {
  if (!items.length) throw new Error("No card candidate is available.");
  return items[randomInt(items.length)]!;
}

export function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

export function reject(message: string): never {
  throw new InteractiveMoveError(message);
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Draw from a fresh deck until `accept` holds; outcomes are chosen by rejection over genuine deals. */
export function sample<T>(make: () => T, accept: (value: T) => boolean, attempts = 20000): T {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = make();
    if (accept(value)) return value;
  }
  throw new Error("Unable to deal a table matching the assigned round.");
}