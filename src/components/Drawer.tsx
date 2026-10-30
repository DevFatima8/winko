"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { XIcon } from "./Icons";

let scrollLocks = 0;
function lockScroll() {
  if (scrollLocks++ === 0) {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
  }
}
function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.documentElement.style.overscrollBehavior = "";
  }
}

type Side = "left" | "right";

/**
 * Professional mobile drawer:
 *  - fully opaque dark backdrop — page content behind is never visible
 *  - backdrop tap and ✕ close it
 *  - slides in from the side; closes on route change / Escape
 *  - body scroll is locked while open
 */
export function Drawer({
  open, onClose, children, side = "left", widthClass = "w-1/2 max-w-none",
  z = 70, showClose = true,
}: { open: boolean; onClose: () => void; children: ReactNode; side?: Side; widthClass?: string; z?: number; showClose?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const sidePos = side === "right" ? "right-0" : "left-0";
  const translateClosed = side === "right" ? "translate-x-full rtl:-translate-x-full" : "-translate-x-full rtl:translate-x-full";
  const desktopClosed = side === "right" ? "md:translate-x-full md:rtl:-translate-x-full" : "md:-translate-x-full md:rtl:translate-x-full";

  // mount with the panel off-screen, then transition in
  useEffect(() => { if (open) setMounted(true); const t = setTimeout(() => setMounted(open), open ? 0 : 220); return () => clearTimeout(t); }, [open]);
  // close on route change
  useEffect(() => { if (open) onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname]);
  // lock body scroll + escape (shared counter so stacked/overlapping locks can never leave the page stuck)
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    lockScroll();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      unlockScroll();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open && !mounted) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: z }} aria-hidden={!open}>
      {/* opaque overlay: completely hides page content */}
      <div
        onClick={onClose}
        className={`absolute inset-0 h-[100dvh] wx-drawer-overlay backdrop-blur-md transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        aria-label="Close menu"
      />
      {/* panel */}
      <aside
        className={`absolute bottom-0 left-0 top-0 z-10 flex h-[100dvh] ${widthClass} min-w-0 origin-bottom-left flex-col border bg-[#140c2a] shadow-[0_-14px_45px_rgba(0,0,0,.45)] transition-[transform,opacity] duration-450 ease-[cubic-bezier(.22,1,.36,1)] will-change-transform md:inset-y-0 md:left-auto md:top-0 md:origin-left md:bg-transparent md:shadow-[12px_0_40px_rgba(0,0,0,.4)] ${sidePos} ${side === "right" ? "rounded-tl-[2rem] border-t md:rounded-l-[2rem] md:rounded-tl-none md:border-l md:border-t-0" : "rounded-tr-[2rem] border-t md:rounded-r-[2rem] md:rounded-tr-none md:border-r md:border-t-0 rtl:origin-bottom-right md:rtl:origin-right"} wx-drawer-panel ${open ? "translate-y-0 scale-100 opacity-100 md:translate-x-0" : `translate-y-full scale-[.96] opacity-0 ${desktopClosed}`}`}
      >
        <div className="pointer-events-none absolute inset-y-5 right-0 z-20 w-px bg-gradient-to-b from-transparent via-[#00e5c0]/70 to-transparent opacity-80" />
        <div className="pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-gradient-to-r from-transparent via-[#ffb800]/80 to-transparent" />
        {showClose && (
          <button onClick={onClose} aria-label="Close menu" className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 transition duration-200 hover:scale-105 hover:bg-white/10 active:scale-95">
            <XIcon size={18} />
          </button>
        )}
        <div className={`wx-scroll h-full overflow-y-auto overscroll-contain transition-[opacity,transform] duration-300 ease-out ${open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>{children}</div>
      </aside>
    </div>,
    document.body
  );
}

/** Hook + trigger button for convenience. */
export function useDrawer() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, openDrawer: () => setOpen(true), closeDrawer: () => setOpen(false) };
}
