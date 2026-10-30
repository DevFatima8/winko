"use client";
import { SupportInbox } from "@/components/admin/SupportInbox";
import Link from "next/link";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function SupportAdminPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/public/data?view=info", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Support settings load nahi ho sakin.");
    const online = Boolean(data.supportOnline);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-white">Live Support Inbox</h1><p className="text-sm text-[#b8a7e6]">Users aur guests ke live chats. Reply yahan se karein — user ko turant nazar aayega.</p></div>
          <div className="flex items-center gap-2 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} /><span className="text-white">{online ? "Support hours: ON" : "Support hours: OFF (auto-reply active)"}</span><Link href="/admin/settings" className="btn-outline rounded-lg px-3 py-1 text-xs font-bold">Hours</Link></div>
        </div>
        <SupportInbox />
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
