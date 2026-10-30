"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const RETURN_KEY = "wx_game_return";

type GameReturn = {
  href: string;
  scrollY: number;
};

export function rememberGameReturn() {
  try {
    const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ href, scrollY: window.scrollY } satisfies GameReturn));
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
    return { href: candidate.href, scrollY: candidate.scrollY };
  } catch (error) {
    console.warn("[game navigation] Could not read the saved return location.", error);
    return null;
  }
}

export function hasGameReturn() {
  return readGameReturn() !== null;
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
