"use client";

import { useEffect, useState } from "react";
import { visibleInterval } from "@/lib/visibleInterval";
import { CheckCircle2 } from "lucide-react";
import { fetchServerBalance } from "@/lib/walletSync";

type ReferralNotice = { id: string; title: string; body: string };

export function ReferralCommissionPopup() {
    const [notice, setNotice] = useState<ReferralNotice | null>(null);
    const [seen, setSeen] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const check = async () => {
            try {
                const response = await fetch("/api/notifications/recent", { cache: "no-store" });
                if (!response.ok) return;
                const data = await response.json() as { notification: ReferralNotice | null };
                if (!active || !data.notification || data.notification.id === seen || data.notification.id === notice?.id) return;
                const stored = window.sessionStorage.getItem("wx_seen_referral_notice");
                if (stored === data.notification.id) return;
                setNotice(data.notification);
                void fetchServerBalance();
            } catch (error) {
                console.error("[wallet congratulations]", error);
            }
        };
        void check();
        const stop = visibleInterval(check, 15000);
        return () => { active = false; stop(); };
    }, [seen, notice?.id]);

    if (!notice) return null;
    const close = () => {
        window.sessionStorage.setItem("wx_seen_referral_notice", notice.id);
        setSeen(notice.id);
        setNotice(null);
    };
    return (
        <div className="fixed inset-x-4 top-5 z-[110] mx-auto max-w-md rounded-2xl border border-emerald-300/40 bg-[#0d2b25] p-4 text-white shadow-2xl shadow-emerald-500/20">
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><CheckCircle2 size={20} /></span>
                <div className="min-w-0 flex-1"><div className="font-black text-emerald-300">{notice.title}</div><p className="mt-1 text-sm text-emerald-50">{notice.body}</p></div>
                <button type="button" onClick={close} className="rounded-lg px-2 text-xl text-emerald-200 hover:bg-white/10" aria-label="Close">×</button>
            </div>
        </div>
    );
}
