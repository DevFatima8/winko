"use client";

import { useAdminCounts } from "./useAdminCounts";

const source = {
  url: "/api/admin/support?unread=1",
  label: "Unread support count",
  events: ["wx:admin-refresh", "wx:support-update", "wx:support-read"],
  parse(data: Record<string, unknown>) {
    if (typeof data.unread !== "number" || !Number.isSafeInteger(data.unread) || data.unread < 0) {
      throw new Error("Invalid unread support count.");
    }
    return { unread: data.unread };
  },
};

export function useSupportUnread(userId?: string) {
  return useAdminCounts(userId, source);
}
