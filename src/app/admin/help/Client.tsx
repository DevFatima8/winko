"use client";
import type { HelpArticleDoc } from "@/models";
import { Card } from "@/components/Shell";
import { HelpArticleForm } from "@/components/admin/Forms";
import { deleteHelpArticleAction } from "@/lib/actions";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function HelpAdminPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const { edit, new: isNew } = searchParams ?? {};
    const response = await fetch("/api/admin/data?view=help", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 403) return REDIRECT("/admin");
    if (!response.ok) throw new Error(data.error ?? "Help articles load nahi ho sake.");
    const list = data.list as HelpArticleDoc[];
    const editing = edit ? list.find((a) => String(a._id) === edit) : null;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-white">Help Center</h1><p className="text-sm text-[#b8a7e6]">Deposit/withdraw guides with pictures — users ko /help par nazar aata hai. Sab editable.</p></div>
          <a href="/admin/help?new=1" className="btn-gold rounded-xl px-4 py-2 text-sm font-black">+ New article</a>
        </div>
        {(isNew || editing) && (
          <Card title={editing ? `Edit: ${editing.title}` : "New article"} action={<a href="/admin/help" className="text-xs text-[#b8a7e6]">Cancel</a>}>
            <HelpArticleForm key={editing ? String(editing._id) : "new"} a={editing ? { id: String(editing._id), title: editing.title, category: editing.category, order: editing.order, isActive: editing.isActive, steps: editing.steps.map((s) => ({ text: s.text ?? "", image: s.image ?? "" })) } : { title: "", category: "Deposit", order: 0, isActive: true, steps: [] }} />
          </Card>
        )}
        <Card title={`Articles (${list.length})`}>
          <ul className="divide-y divide-[#3a2470]/50">
            {list.map((a) => (
              <li key={String(a._id)} className="flex items-center justify-between gap-3 py-3">
                <div><div className="font-bold text-white">{a.title} {!a.isActive && <span className="ml-1 rounded bg-red-500/20 px-1.5 text-[10px] text-red-300">hidden</span>}</div><div className="text-xs text-[#b8a7e6]">{a.category} · order {a.order} · {a.steps.length} steps · {a.steps.filter((s) => s.image).length} pictures</div></div>
                <div className="flex gap-2">
                  <a href={`/help#${a._id}`} target="_blank" className="btn-outline rounded-lg px-2.5 py-1 text-xs font-semibold">View</a>
                  <a href={`/admin/help?edit=${a._id}`} className="btn-violet rounded-lg px-2.5 py-1 text-xs font-semibold">Edit</a>
                  <form action={deleteHelpArticleAction.bind(null, String(a._id))}><button className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs text-red-300">Delete</button></form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
