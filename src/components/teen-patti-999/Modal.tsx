"use client";

import type { ReactNode } from "react";
import { cn } from "./lib/utils";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export default function Modal({ open, title, onClose, children, wide }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "animate-pop-in relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-amber-400/40 bg-gradient-to-b from-slate-800 to-slate-950 p-5 shadow-[0_0_50px_rgba(0,0,0,.8)]",
          wide && "max-w-lg"
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="gold-text font-serif text-2xl font-black">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-700 text-sm font-bold text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
