import { createHash } from "node:crypto";

export function gregmornGameSlug(gameId: string) {
  return `gregmorn-${createHash("sha256").update(gameId).digest("hex").slice(0, 40)}`;
}

export function isGregmornSlug(slug: string) {
  return /^gregmorn-[a-f0-9]{40}$/.test(slug);
}
