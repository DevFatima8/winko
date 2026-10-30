"use client";

import { DAILY_POOL_VERSION, type DailyPoolGame } from "./dailyPoolRules";

const accepted = new Set<DailyPoolGame>();
export function acceptDailyPool(game: DailyPoolGame) { accepted.add(game); }
export function dailyPoolConsent(game: DailyPoolGame) { return accepted.has(game) ? DAILY_POOL_VERSION : undefined; }
