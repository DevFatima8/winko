"use client";

import { useSyncExternalStore } from "react";

const KEY = "wx_app_installed";
const CHANGED = "wx:app-installed";
let confirmed = false;

export type AppInstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __wxInstallPrompt?: AppInstallEvent;
  }
}

export function resetAppInstalled() {
  confirmed = false;
  try {
    localStorage.removeItem(KEY);
  } catch (error) {
    console.warn("[app install] Cannot reset saved installation status.", error);
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function isAppInstalled() {
  if (typeof window === "undefined") return true;
  if (confirmed || window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch (error) {
    console.warn("[app install] Cannot read saved installation status.", error);
    return false;
  }
}

export function rememberAppInstalled() {
  confirmed = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch (error) {
    console.warn("[app install] Cannot save installation status.", error);
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  const mode = window.matchMedia("(display-mode: standalone)");
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  mode.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
    mode.removeEventListener("change", onChange);
  };
}

export function useAppInstalled() {
  return useSyncExternalStore(subscribe, isAppInstalled, () => true);
}
