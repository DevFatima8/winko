"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const RETURN_KEY = "wx_game_return";

type GameReturn = {
  href: string;
  scrollY: number;
  provider?: ProviderGameReturn;
};

export type ProviderGameReturn = {
  category: string;
  search: string;
  provider: string;
  limit: number;
  sliderScrollLeft: number;
};

export function rememberGameReturn(provider?: ProviderGameReturn) {
  try {
    const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ href, scrollY: window.scrollY, provider } satisfies GameReturn));
  } catch (error) {
    console.warn("[game navigation] Could not save the return location.", error);
  }
}

function readGameReturn(): GameReturn | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<GameReturn>;
    if (typeof candidate.href !== "string" || !candidate.href.startsWith("/") || candidate.href.startsWith("//")) return null;
    if (typeof candidate.scrollY !== "number" || !Number.isFinite(candidate.scrollY) || candidate.scrollY < 0) return null;
    return { href: candidate.href, scrollY: candidate.scrollY, provider: candidate.provider };
  } catch (error) {
    console.warn("[game navigation] Could not read the saved return location.", error);
    return null;
  }
}

export function hasGameReturn() {
  return readGameReturn() !== null;
}

export function isGameReturn() {
  const saved = readGameReturn();
  return saved?.href === `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function readProviderGameReturn(): ProviderGameReturn | null {
  const saved = readGameReturn();
  if (!saved || saved.href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) return null;
  const state = saved.provider;
  if (!state) return null;
  if (typeof state.category !== "string" || typeof state.search !== "string" || typeof state.provider !== "string" ||
      !Number.isSafeInteger(state.limit) || state.limit < 60 ||
      !Number.isFinite(state.sliderScrollLeft) || state.sliderScrollLeft < 0) {
    console.warn("[game navigation] Invalid saved provider view.");
    return null;
  }
  return state;
}

export function useGameReturnScroll(ready: boolean) {
  const pathname = usePathname();
  useEffect(() => {
    if (!ready) return;
    const saved = readGameReturn();
    if (!saved || saved.href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        window.scrollTo({ top: saved.scrollY, behavior: "instant" });
        try {
          sessionStorage.removeItem(RETURN_KEY);
        } catch (error) {
          console.warn("[game navigation] Could not clear the restored return location.", error);
        }
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [pathname, ready]);
}
