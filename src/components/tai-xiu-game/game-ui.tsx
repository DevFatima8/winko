"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Dices, X } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}>
    <span className="brand-mark"><Dices size={25} strokeWidth={1.7} /></span>
    <div className="brand-wordmark">tai<span>xiu</span><small>PLAY THE POSSIBILITIES</small></div>
  </div>;
}

export function Coin({ className = "" }: { className?: string }) {
  return <span className={`coin-token ${className}`} aria-hidden="true"><span>✦</span></span>;
}

const faces: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export function DiceFace({ value, small = false, className = "" }: { value: number; small?: boolean; className?: string }) {
  return <span className={`die ${small ? "die-small" : ""} ${className}`} role="img" aria-label={`Die showing ${value}`}>
    {Array.from({ length: 9 }, (_, i) => <i key={i} className={faces[value]?.includes(i) ? "pip visible" : "pip"} aria-hidden="true" />)}
  </span>;
}

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-inner">
      <div className="modal-heading"><div><span className="eyebrow">THE TAI XIU CLUB</span><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button close-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
      <div className="modal-content">{children}</div>
    </div>
  </dialog>;
}
