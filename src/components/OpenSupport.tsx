"use client";
import { HeadsetIcon } from "@/components/Icons";
export function OpenSupportButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button onClick={() => window.dispatchEvent(new Event("wx:open-support"))} className={className ?? "btn-violet inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"} title="Live Support">
      {children ?? (className ? <HeadsetIcon size={16} /> : <><HeadsetIcon size={16} /> Live Support</>)}
    </button>
  );
}
