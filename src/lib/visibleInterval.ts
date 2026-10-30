/** setInterval that stays idle while the tab is hidden and catches up once when it becomes visible again. */
export function visibleInterval(fn: () => void, ms: number) {
  const id = window.setInterval(() => { if (!document.hidden) fn(); }, ms);
  const onVisible = () => { if (!document.hidden) fn(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
}
