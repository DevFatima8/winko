/** Runs local animation only while the page is visible; false ends the loop. */
export function visibleAnimationFrame(frame: (now: number) => void | boolean) {
  let id: number | null = null;
  let stopped = false;
  let pageHidden = false;

  const schedule = () => {
    if (!stopped && !pageHidden && !document.hidden && id === null) {
      id = window.requestAnimationFrame(tick);
    }
  };
  const tick = (now: number) => {
    id = null;
    if (stopped || pageHidden || document.hidden) return;
    if (frame(now) === false) stopped = true;
    schedule();
  };
  const cancel = () => {
    if (id !== null) window.cancelAnimationFrame(id);
    id = null;
  };
  const onVisibility = () => {
    cancel();
    schedule();
  };
  const onHide = () => {
    pageHidden = true;
    cancel();
  };
  const onShow = () => {
    pageHidden = false;
    schedule();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  schedule();

  return () => {
    stopped = true;
    cancel();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
  };
}
