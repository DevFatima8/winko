"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeftIcon } from "./Icons";

export function SubHeader({ title, back = "/player/profile", right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={back} aria-label="Back" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#3a2470] text-[#b8a7e6] hover:text-white"><ArrowLeftIcon size={18} /></Link>
        <h1 className="truncate text-xl font-black text-white">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#b8a7e6] rtl:rotate-180"><path d="m9 6 6 6-6 6" /></svg>;
}

export function CopyBtn({ value, label = "Copy" }: { value: string; label?: string }) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard is unavailable.");
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch (error) {
      console.error("[copy]", error);
      setStatus("Copy failed. Select the text and copy manually.");
    }
  };
  return (
    <span className="relative inline-flex shrink-0">
      <button type="button" aria-label={label} title={label} onClick={copy} className="shrink-0 rounded-md p-1 text-[#b8a7e6] hover:text-white">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      </button>
      {status && <span role="status" className="absolute left-0 top-full z-50 w-max max-w-[150px] rounded-md bg-[#24183c] px-2 py-1 text-[10px] font-medium text-white shadow-lg">{status}</span>}
    </span>
  );
}

export function Bar({ pct }: { pct: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-gradient-to-r from-[#ffb800] to-[#ff8a00]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}
