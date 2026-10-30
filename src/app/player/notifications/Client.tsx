"use client";
import { Card, fmtDate } from "@/components/Shell";
import { markNotificationsReadAction } from "@/lib/actions";
import { GiftIcon, ShieldIcon, CheckIcon, MegaphoneIcon, BellIcon } from "@/components/Icons";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function NotificationsPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/player/notifications", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Notifications load nahi sakin.");
    const list = data.list as { _id: string; type: string; title: string; body: string; createdAt: string }[];
    await markNotificationsReadAction();
    const icon = (t: string) => (t === "promo" ? <GiftIcon size={22} /> : t === "warning" ? <ShieldIcon size={22} /> : t === "success" ? <CheckIcon size={22} /> : <MegaphoneIcon size={22} />);
    return (
      <div className="space-y-6">
        <h1 className="flex items-center gap-2 text-2xl font-black text-white"><BellIcon size={24} /> Notifications</h1>
        <Card>
          <ul className="divide-y divide-[#3a2470]/50">
            {list.map((n) => <li key={String(n._id)} className="flex gap-3 py-3"><span className="mt-0.5 text-[#c4b5fd]">{icon(n.type)}</span><div><div className="font-bold text-white">{n.title}</div><p className="text-sm text-[#e9ddff]">{n.body}</p><div className="mt-0.5 text-xs text-[#6f5fa3]">{fmtDate(n.createdAt)}</div></div></li>)}
            {list.length === 0 && <li className="py-8 text-center text-[#6f5fa3]">Koi notification nahi.</li>}
          </ul>
        </Card>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
