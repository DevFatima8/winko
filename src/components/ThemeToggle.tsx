"use client";

import { useEffect } from "react";

// The site is dark-only. Any previously saved light preference is cleared.
export function ThemeToggle(props: { compact?: boolean }) {
  void props;
  useEffect(() => {
    document.documentElement.classList.remove("light");
    try { localStorage.setItem("wx_theme", "dark"); } catch { }
    document.cookie = `theme=dark; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, []);
  return null;
}
