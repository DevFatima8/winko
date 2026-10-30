import { readBrowserSlotOutcome, type BrowserSlotGame, type BrowserSlotOutcomes } from "./browserSlotTypes";
import type { FreeMode } from "@/components/diao-chan/game/config";

type Presentation<G extends BrowserSlotGame> = {
  outcome: BrowserSlotOutcomes[G];
  cursor: number;
  mode?: FreeMode;
};
const key = (game: string) => `wx:slot-presentation:${game}`;
const ownerKey = (game: string) => `wx:browser-active:${game}:main:owner`;

/** Presentation only: the entire wager was already settled; replay cannot move money. */
export function readSlotPresentation<G extends BrowserSlotGame>(game: G): Presentation<G> | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key(game)) ?? "null");
    if (!saved || saved.owner !== localStorage.getItem(ownerKey(game)) ||
        !Number.isInteger(saved.cursor) || saved.cursor < 0 || saved.cursor > 12 ||
        saved.mode !== undefined && !["diaochan", "dongzhuo", "lubu"].includes(saved.mode)) return null;
    const outcome = readBrowserSlotOutcome(game, saved.outcome, saved.outcome?.stake);
    return outcome ? { outcome, cursor: saved.cursor, mode: saved.mode } : null;
  } catch {
    return null;
  }
}

export function saveSlotPresentation<G extends BrowserSlotGame>(game: G, presentation: Presentation<G> | null) {
  if (typeof window === "undefined") return;
  if (!presentation) localStorage.removeItem(key(game));
  else localStorage.setItem(key(game), JSON.stringify({
    ...presentation, owner: localStorage.getItem(ownerKey(game)),
  }));
}
