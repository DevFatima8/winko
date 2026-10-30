"use client";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { GatewayCheckout } from "@/components/GatewayCheckout";
import { Logo } from "@/components/lobby/Lobby";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function PayPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const { id } = params ?? {};
    const me = await getCurrentUser();
    if (!me || me.role !== "client") return REDIRECT("/login");
    return (
      <div className="wx-bg min-h-screen text-white">
        <header className="flex items-center justify-between border-b border-[#3a2470] px-4 py-3"><Logo size="sm" /><Link href="/player/wallet" className="text-xs text-[#b8a7e6] hover:text-white">← Wallet</Link></header>
        <main className="px-3 py-6"><GatewayCheckout id={id} /></main>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
