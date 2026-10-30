"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ShareIcon, WalletIcon, WhatsAppIcon, XIcon } from "@/components/Icons";
import { referralLink } from "@/lib/siteUrl";
import type { Viewer } from "./Lobby";

type Action = "whatsapp" | "share" | "deposit";

export function FloatingActions({ viewer, whatsappChannel }: { viewer: Viewer; whatsappChannel?: string }) {
  const [hidden, setHidden] = useState<Action[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(viewer.loggedIn);
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!viewer.loggedIn || viewer.isAdmin) return;
    const controller = new AbortController();
    void fetch("/api/public/data?view=invite", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Referral link could not be loaded.");
        const data = await response.json() as { referralCode?: string | null };
        if (!data.referralCode) throw new Error("Referral code is not available. Please open Invite.");
        setCode(data.referralCode);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("[lobby referral]", error);
          setMessage("Referral link load nahi hua. Invite page se dobara try karein.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [viewer.loggedIn, viewer.isAdmin]);

  const share = async () => {
    if (!code || sharing) return;
    setSharing(true);
    setMessage("");
    try {
      const url = referralLink(code);
      if (navigator.share) await navigator.share({ title: "Join winkox", text: "Join winkox using my referral link.", url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage("Referral link copied!");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.error("[lobby share]", error);
        setMessage("Share nahi ho saka. Invite page se apna referral link copy karein.");
      }
    } finally {
      setSharing(false);
    }
  };
  const channel = (() => {
    if (!whatsappChannel) return null;
    try {
      const url = new URL(whatsappChannel);
      return url.protocol === "https:" && /^(www\.)?whatsapp\.com$/.test(url.hostname) && /^\/channel\/[^/]+/.test(url.pathname) ? url.href : null;
    } catch {
      return null;
    }
  })();
  if (viewer.isAdmin) return null;
  const circle = "keep-white flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/80 text-white shadow-lg";
  const item = (action: Action, content: ReactNode, position: string) => !hidden.includes(action) && (
    <div className={`fixed z-20 opacity-65 transition-opacity hover:opacity-100 focus-within:opacity-100 ${position}`} key={action} data-floating-action={action}>
      {content}
      <button type="button" aria-label={`Hide ${action} shortcut`} onClick={() => setHidden((items) => [...items, action])} className="keep-white absolute -left-1 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/60 bg-slate-950 text-white shadow"><XIcon size={12} /></button>
    </div>
  );
  return <>
    {item("whatsapp", channel
      ? <a href={channel} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp channel" className={`${circle} bg-[#25d366]`}><WhatsAppIcon size={28} /></a>
      : <button type="button" aria-label="WhatsApp channel" onClick={() => setMessage("WhatsApp channel abhi available nahi. Please contact support.")} className={`${circle} bg-[#25d366]`}><WhatsAppIcon size={28} /></button>,
    "right-3 bottom-[16.5rem] md:right-6 md:bottom-[17rem]")}
    {item("share", !viewer.loggedIn
      ? <Link href="/login" aria-label="Share referral link" className={`${circle} bg-[#8b5cf6]`}><ShareIcon size={24} /></Link>
      : code
        ? <button type="button" aria-label="Share referral link" disabled={sharing} onClick={() => void share()} className={`${circle} bg-[#8b5cf6] disabled:opacity-60`}><ShareIcon size={24} /></button>
        : <Link href="/player/team" aria-label={loading ? "Loading referral link" : "Open Invite to share referral link"} className={`${circle} bg-[#8b5cf6]`}><ShareIcon size={24} /></Link>,
    "right-3 bottom-[12rem] md:right-6 md:bottom-[12.5rem]")}
    {item("deposit", <Link href={viewer.loggedIn ? "/player/deposit" : "/login"} aria-label="Deposit - 5% first deposit bonus" className={`${circle} relative bg-gradient-to-br from-[#ffc933] to-[#eb8b17]`}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#ffc933] motion-safe:animate-ping" />
      <WalletIcon size={24} />
      <span className="absolute -right-1 -top-2 rounded-full bg-[#ef283f] px-1.5 text-[10px] font-black leading-5 text-white">5%</span>
    </Link>, "left-3 bottom-[15rem] md:left-6 md:bottom-20")}
    {message && <div role="status" className="fixed bottom-[21rem] left-1/2 z-[45] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-white/20 bg-slate-950 p-3 text-center text-xs text-white shadow-xl">
      {message}<button type="button" aria-label="Dismiss shortcut message" onClick={() => setMessage("")} className="ml-2 inline-flex align-middle"><XIcon size={14} /></button>
    </div>}
  </>;
}
