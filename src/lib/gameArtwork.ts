"use client";

import { getImageProps } from "next/image";
import { GAME_THUMBNAILS } from "./gameCatalog";

export const GAME_THUMBNAIL_SIZES = "(max-width: 639px) 45vw, (max-width: 1023px) 30vw, 220px";
const ready = new Set<string>();
const pending = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();

export const isGameArtworkReady = (src: string) => ready.has(src);
export function subscribeGameArtwork(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function preload(src: string): Promise<boolean> {
  const existing = pending.get(src);
  if (existing) return existing;
  const task = new Promise<boolean>(resolve => {
    const image = new window.Image();
    image.decoding = "async";
    const finish = (loaded: boolean) => {
      image.onload = null;
      image.onerror = null;
      if (loaded) {
        ready.add(src);
        for (const listener of listeners) listener();
      }
      else console.warn("[game artwork] Could not load image", src);
      resolve(loaded);
    };
    image.onload = () => {
      void image.decode().then(() => finish(true), () => finish(false));
    };
    image.onerror = () => finish(false);
    if (GAME_THUMBNAILS[src]) image.src = GAME_THUMBNAILS[src];
    else if (src.startsWith("/games/")) {
      const { props } = getImageProps({ src, alt: "", width: 1024, height: 700, sizes: GAME_THUMBNAIL_SIZES });
      image.sizes = props.sizes ?? "";
      image.srcset = props.srcSet ?? "";
      image.src = props.src;
    } else image.src = src;
  }).catch(error => {
    console.warn("[game artwork] Could not prepare image", src, error);
    return false;
  });
  pending.set(src, task);
  void task.then(loaded => { if (!loaded) pending.delete(src); });
  return task;
}

export async function preloadGameArtwork(sources: readonly string[]) {
  const queue = [...new Set(sources)].filter(src => src && !ready.has(src));
  let next = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (next < queue.length) {
      const src = queue[next++];
      if (!await preload(src)) failed++;
    }
  }));
  return { failed };
}
