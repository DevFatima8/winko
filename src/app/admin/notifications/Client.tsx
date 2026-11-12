"use client";
import { Card, fmtDate } from "@/components/Shell";
import { NotificationForm } from "@/components/admin/Forms";
import { deleteNotificationAction } from "@/lib/actions";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";
import { withAdminRefresh } from "@/lib/adminLiveUpdates";

export default function NotificationsPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/admin/data?view=notifications", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Notifications load nahi ho sakin.");
    const list = data.list as { _id: string; type: string; title: string; audience: string; body: string; createdAt: string; readBy: string[] }[];
    const total = Number(data.total ?? 0), level = Number(data.level ?? 0);
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-white">Notifications / Broadcast</h1><p className="text-sm text-[#b8a7e6]">{level >= 3 ? "Security alerts sirf Agent ko dikhte hain. Agent activity notifications band hain." : level < 2 ? `Apni team ke ${total} member(s) ko notification bhejein.` : `Yahan message likhein — sab platform users (${total}) ko app/website mein notification mil jayegi (bell icon + popup).`}</p></div>
        {level < 3 ? <Card title="Send new notification"><NotificationForm level={level} /></Card> : <p className="text-sm text-[#b8a7e6]">Agent activity notifications are disabled. Security alerts appear in your notification bell.</p>}
        <Card title={`Sent (${list.length})`}>
          <ul className="divide-y divide-[#3a2470]/50">
            {list.map((n) => (
              <li key={String(n._id)} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2"><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${n.type === "promo" ? "bg-[#ffb800]/20 text-[#ffb800]" : n.type === "warning" ? "bg-red-500/20 text-red-300" : n.type === "success" ? "bg-emerald-500/20 text-emerald-300" : "bg-[#8b5cf6]/20 text-[#c4b5fd]"}`}>{n.type}</span><b className="text-white">{n.title}</b><span className="text-xs text-[#6f5fa3]">→ {n.audience}</span></div>
                  <p className="mt-1 text-sm text-[#e9ddff]">{n.body}</p>
                  <div className="mt-1 text-xs text-[#6f5fa3]">{fmtDate(n.createdAt)} · read by {n.readBy.length}</div>
                </div>
                {level >= 2 && <form action={withAdminRefresh(deleteNotificationAction.bind(null, String(n._id)))}><button className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs text-red-300">Delete</button></form>}
              </li>
            ))}
            {list.length === 0 && <li className="py-6 text-center text-[#6f5fa3]">Abhi koi notification nahi bheji.</li>}
          </ul>
        </Card>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
