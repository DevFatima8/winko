"use client";
import { LaptopIcon, AndroidIcon } from "@/components/Icons";
import { useAppInstalled } from "@/lib/appInstall";

const installNow = () => window.dispatchEvent(new Event("wx:install-now"));

export function InstallApp({ compact }: { androidUrl?: string; iosUrl?: string; compact?: boolean }) {
  const installed = useAppInstalled();
  if (installed) return null;
  return (
    <div className={compact ? "flex gap-2" : "space-y-2"}>
      <button type="button" onClick={installNow} className="store-badge keep-white flex w-full items-center gap-2 rounded-lg bg-black px-3 py-2 text-left text-white ring-1 ring-white/15 transition hover:scale-[1.02] hover:ring-[#ffb800] active:scale-95">
        <AndroidIcon size={26} />
        <span><span className="block text-[8px] font-normal uppercase tracking-wide text-slate-300">Android </span><span className="text-sm font-black">Install on phone</span></span>
      </button>
      <button type="button" onClick={installNow} className="store-badge keep-white flex w-full items-center gap-2 rounded-lg bg-black px-3 py-2 text-left text-white ring-1 ring-white/15 transition hover:scale-[1.02] hover:ring-[#ffb800] active:scale-95">
        <LaptopIcon size={26} />
        <span><span className="block text-[8px] font-normal uppercase tracking-wide text-slate-300">Windows</span><span className="text-sm font-black">Install on computer</span></span>
      </button>
    </div>
  );
}
