"use client";

import { dailyPoolConsent } from "./dailyPoolConsent";
import { isDailyPoolGame } from "./dailyPoolRules";

export function localApi(url: string, init?: RequestInit): Promise<Response> {
  if (init?.method?.toUpperCase() === "POST" && typeof init.body === "string" && ["/api/aviator/bet", "/api/cards/bet", "/api/chicken/start", "/api/chickendash/start", "/api/plinko/drop", "/api/limbo", "/api/mines", "/api/slot777"].includes(url)) {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    const game = url === "/api/chicken/start" ? "chicken-road-2" : url === "/api/chickendash/start" ? "chicken-dash" : url === "/api/plinko/drop" ? "plinko" : url === "/api/limbo" ? "limbo" : url === "/api/mines" && body.action === "start" ? "mines" : url === "/api/slot777" ? "lucky-777" : String(body.table ?? (url === "/api/aviator/bet" ? "aviator" : ""));
    if (isDailyPoolGame(game)) {
      return fetch(url, { ...init, body: JSON.stringify({ ...body, poolRulesVersion: dailyPoolConsent(game) }) });
    }
  }
  return fetch(url, init);
}
