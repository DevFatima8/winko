"use client";

import { useAdminCounts } from "./useAdminCounts";

type PendingCounts = { deposits: number; withdrawals: number };

const source = {
  url: "/api/admin/pending-payments",
  label: "Pending payment counts",
  events: ["wx:admin-refresh"],
  parse(data: Record<string, unknown>): PendingCounts {
    if (typeof data.deposits !== "number" || !Number.isSafeInteger(data.deposits) || data.deposits < 0 ||
      typeof data.withdrawals !== "number" || !Number.isSafeInteger(data.withdrawals) || data.withdrawals < 0) {
      throw new Error("Invalid pending payment counts.");
    }
    return { deposits: data.deposits, withdrawals: data.withdrawals };
  },
};

export function usePendingPayments(userId?: string) {
  return useAdminCounts(userId, source);
}
