"use client";

import { useEffect, useState } from "react";
import type { ProviderCatalogGame } from "./gregmornCatalog";
import { isGameReturn } from "./gameNavigation";
import { readReturnCatalog, saveProviderCatalog, warmProviderCatalog } from "./providerCatalogCache";

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
    void fetch("/api/gregmorn/catalog", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { games?: ProviderCatalogGame[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Provider games could not be loaded.");
        if (!Array.isArray(data.games)) throw new Error("Provider returned an invalid game catalogue.");
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
      });
    return () => controller.abort();
  }, [enabled]);

  return state;
}
