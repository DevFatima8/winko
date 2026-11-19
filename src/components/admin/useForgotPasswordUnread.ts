"use client";

import { useAdminCounts } from "./useAdminCounts";

const source = {
  url: "/api/admin/forgot-password?unread=1",
  label: "Forgot password requests",
  events: ["wx:admin-refresh"],
  parse(data: Record<string, unknown>) {
    if (typeof data.unread !== "number" || !Number.isSafeInteger(data.unread) || data.unread < 0) {
      throw new Error("Invalid forgot password request count.");
    }
    return { unread: data.unread };
  },
};

export function useForgotPasswordUnread(userId?: string) {
  return useAdminCounts(userId, source);
}
