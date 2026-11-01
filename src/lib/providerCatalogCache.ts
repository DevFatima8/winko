"use client";

import type { ProviderCatalogGame } from "./gregmornCatalog";

const KEY = "wx_provider_catalog_cache";
let warm: { games: ProviderCatalogGame[]; at: number } | null = null;

function cacheName() {
  let name = sessionStorage.getItem(KEY);
  if (!name) {
    name = `wx-catalog-${crypto.randomUUID()}`;
    sessionStorage.setItem(KEY, name);
  }
  return name;
}

export function warmProviderCatalog() {
  return warm && Date.now() - warm.at < 60_000 ? warm.games : null;
}

export async function saveProviderCatalog(games: ProviderCatalogGame[]) {
  warm = { games, at: Date.now() };
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(cacheName());
    await cache.put("/api/gregmorn/catalog", Response.json({ games, at: Date.now() }));
  } catch (error) { console.warn("[Provider catalog] Could not cache return catalogue", error); }
}

export async function readReturnCatalog() {
  if (!("caches" in window)) return null;
  try {
    const name = sessionStorage.getItem(KEY);
    if (!name) return null;
    const cache = await caches.open(name);
    const response = await cache.match("/api/gregmorn/catalog");
    if (!response) return null;
    const data = await response.json();
    if (!Number.isFinite(data.at) || Date.now() - data.at > 24 * 3600000 ||
        !Array.isArray(data.games) || !data.games.every((game: ProviderCatalogGame) =>
          typeof game?.id === "string" && typeof game.title === "string" && typeof game.slug === "string" &&
          typeof game.imageUrl === "string" && typeof game.provider === "string" && typeof game.isActive === "boolean")) {
      console.warn("[Provider catalog] Invalid or expired return catalogue");
      return null;
    }
    return data.games as ProviderCatalogGame[];
  } catch (error) {
    console.warn("[Provider catalog] Could not read return catalogue", error);
    return null;
  }
}

export async function clearProviderCatalog() {
  warm = null;
  try {
    const name = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem("wx_game_return");
    if (name && "caches" in window) await caches.delete(name);
  } catch (error) { console.warn("[Provider catalog] Could not clear catalogue", error); }
}
