"use client";

import { useSyncExternalStore } from "react";

let unread = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => unread;
const serverSnapshot = () => 0;
export const getSupportUnread = () => unread;

export function setSupportUnread(count: number) {
  if (unread === count) return;
  unread = count;
  listeners.forEach((listener) => listener());
}

export function SupportUnreadDot() {
  const count = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return count > 0 ? <span role="status" aria-label="Unread support reply" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#140c2a]" /> : null;
}
