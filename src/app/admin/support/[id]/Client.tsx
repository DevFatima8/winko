"use client";
import { SupportInbox } from "@/components/admin/SupportInbox";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function SupportThreadPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
  const { id } = params ?? {};
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-white">Live Support</h1><SupportInbox initialThread={id} /></div>;
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
