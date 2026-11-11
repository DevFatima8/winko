"use client";

import { useEffect, useState } from "react";
import type { ProviderCatalogGame } from "./gregmornCatalog";
import { isGameReturn } from "./gameNavigation";
import { readReturnCatalog, saveProviderCatalog, warmProviderCatalog } from "./providerCatalogCache";
import { SITE_CATALOG_URL } from "./gameAvailability";

export type ProviderCatalogState = {
  games: ProviderCatalogGame[];
  loading: boolean;
  error: string;
};

export function useProviderCatalog(enabled = true): ProviderCatalogState {
  const [state, setState] = useState<ProviderCatalogState>({ games: [], loading: true, error: "" });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let fresh = false;
    let pending = false;
    const warm = warmProviderCatalog();
    if (warm) {
      void Promise.resolve().then(() => {
        if (!controller.signal.aborted && !fresh) setState({ games: warm, loading: false, error: "" });
      });
    } else if (isGameReturn()) {
      void readReturnCatalog().then(games => {
        if (games && !controller.signal.aborted && !fresh) setState({ games, loading: false, error: "" });
      });
    }
    const refresh = () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      void fetch(SITE_CATALOG_URL, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { games?: ProviderCatalogGame[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Games could not be loaded.");
        if (!Array.isArray(data.games)) throw new Error("Invalid game catalogue.");
        if (!controller.signal.aborted) {
          fresh = true;
          setState({ games: data.games, loading: false, error: "" });
          void saveProviderCatalog(data.games);
        }
      })
      .catch(reason => {
        if (!controller.signal.aborted) {
          fresh = true;
          setState(previous => ({ ...previous, loading: false, error: reason instanceof Error ? reason.message : "Provider games could not be loaded." }));
        }
      })
      .finally(() => { pending = false; });
    };
    const refreshVisible = () => { if (!document.hidden) refresh(); };
    refresh();
    const interval = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [enabled]);

  return state;
}
