"use client";

import { useActionState } from "react";

type AdminActionState = { error?: unknown; success?: unknown } | undefined;

export function refreshAdminData() {
  window.dispatchEvent(new Event("wx:admin-refresh"));
}

export function useAdminActionState<State extends AdminActionState, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
) {
  return useActionState<State, Payload>(async (previous, payload) => {
    const result = await action(previous, payload);
    if (result && result.success && !result.error) refreshAdminData();
    return result;
  }, initialState);
}

export function withAdminRefresh<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
) {
  return async (...args: Args) => {
    const result = await action(...args);
    if (result && typeof result === "object" && "error" in result && result.error) return result;
    refreshAdminData();
    return result;
  };
}
