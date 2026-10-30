"use client";

import { cn } from "@/lib/cn";

type Props = {
  balance: number;
  muted: boolean;
  onToggleMute: () => void;
  onWallet: () => void;
};

export default function TopBar({ balance, muted, onToggleMute, onWallet }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/30 bg-[#0f212e]">
      <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#00e701] text-lg font-black text-[#05212d]">
              K
            </span>
            <span className="hidden text-lg font-black tracking-tight sm:block">
              KENO
            </span>
          </div>
          <span className="hidden rounded-full bg-[#1a2c38] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#b1c2cf] md:block">
            Originals
          </span>
          <nav className="ml-2 hidden items-center gap-1 lg:flex">
            {["Casino", "Sports", "Promotions"].map((item, i) => (
              <span
                key={item}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                  i === 0
                    ? "bg-[#1a2c38] text-white"
                    : "text-[#b1c2cf] hover:bg-[#1a2c38] hover:text-white",
                )}
              >
                {item}
              </span>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid h-9 w-9 place-items-center rounded-md text-[#b1c2cf] transition-colors hover:bg-[#1a2c38] hover:text-white"
          >
            {muted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3l3.5 3.5-1.4 1.4L15 13.4 11.6 17l-1.4-1.4L13.7 12l-3.5-3.5L11.6 7l3.5 3.5L18.6 7 20 8.4 16.5 12z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13 3a4 4 0 00-2-3.46v6.92A4 4 0 0016 12zm-2-7.5v2.06a6 6 0 010 10.88v2.06a8 8 0 000-15z" />
              </svg>
            )}
          </button>

          <div className="flex items-center gap-2 rounded-md bg-[#1a2c38] px-3 py-1.5">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[#f5b700] text-[11px] font-black text-[#0f212e]">
              $
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-white">
              {balance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>

          <button
            type="button"
            onClick={onWallet}
            className="rounded-md bg-[#00e701] px-3 py-2 text-sm font-bold text-[#05212d] transition-colors hover:bg-[#1fff20]"
          >
            Wallet
          </button>
        </div>
      </div>
    </header>
  );
}
