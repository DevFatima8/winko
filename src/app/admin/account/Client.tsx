"use client";
import { Card } from "@/components/Shell";
import { OwnPasswordForm } from "@/components/admin/StaffForms";
import { CopyLink } from "@/components/ProfileForms";
import { logoutAction } from "@/lib/clientActions";
import { usePage, NOT_FOUND, REDIRECT } from "@/lib/useDb";

export default function AccountPageClient({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params; void searchParams;
  return usePage(async () => {
    const response = await fetch("/api/admin/data?view=account", { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Account load nahi ho saka.");
    const me = data.me;
    return (
      <div className="max-w-xl space-y-6">
        <h1 className="text-2xl font-bold text-white">My Account</h1>
        <Card title="Profile">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-black/30 p-3"><div className="text-[10px] uppercase text-[#6f5fa3]">Name</div><div className="text-white">{me.name}</div></div>
            <div className="rounded-xl bg-black/30 p-3"><div className="text-[10px] uppercase text-[#6f5fa3]">Login ID</div><div className="font-mono text-[#ffb800]">{me.adminId ?? "—"}</div></div>
            <div className="rounded-xl bg-black/30 p-3"><div className="text-[10px] uppercase text-[#6f5fa3]">Role</div><div className="text-white">{me.level >= 3 ? "Agent" : me.level >= 2 ? "Super Admin" : "Sub Admin"}</div></div>
            <div className="rounded-xl bg-black/30 p-3"><div className="text-[10px] uppercase text-[#6f5fa3]">Phone</div><div className="text-white">{me.phone.startsWith("ADM") ? "—" : me.phone}</div></div>
          </div>
        </Card>
        {me.level < 2 && (
          <Card title="My referral link">
            <p className="mb-2 text-sm text-[#b8a7e6]">Ye link share karein — jo bhi is se signup karega wo aap ki team mein add hoga. Referral code: <b className="font-mono text-white">{me.referralCode ?? "—"}</b></p>
            {me.referralCode ? <CopyLink link={`${typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=${me.referralCode}`} /> : <p className="text-sm text-[#6f5fa3]">Referral code abhi generate nahi hua — super admin se rabta karein.</p>}
          </Card>
        )}
        <Card title="Change password"><OwnPasswordForm /></Card>
        <form action={logoutAction}><button className="rounded-xl border border-[#3a2470] px-4 py-2 text-sm text-[#b8a7e6] hover:border-[#ff3b5c] hover:text-[#ff3b5c]">Logout</button></form>
      </div>
    );
  }, [JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
