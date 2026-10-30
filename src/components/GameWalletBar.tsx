"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { fetchServerBalance, getStoredWalletBalance, subscribeWalletBalance } from "@/lib/walletSync";
import { useI18n } from "@/lib/i18n/client";

export function GameWalletBar({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [balance, setBalance] = useState<number>(() => getStoredWalletBalance() ?? 0);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; phone?: string } | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/player/balance", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.loggedIn) {
          setBalance(data.balance ?? 0);
          setUser(data.user ?? null);
        } else {
          setUser(null);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeWalletBalance((newBal) => {
      setBalance(newBal);
    });

    const handleCustomUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.balance === "number") {
        setBalance(detail.balance);
      }
    };

    window.addEventListener("wx:balance-update", handleCustomUpdate);
    window.addEventListener("wx:session", refresh);

    return () => {
      unsub();
      window.removeEventListener("wx:balance-update", handleCustomUpdate);
      window.removeEventListener("wx:session", refresh);
    };
  }, [refresh]);

  const copyToClipboard = (text: string, id: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedAccount(id);
      setTimeout(() => setCopiedAccount(null), 2500);
    }
  };

  return (
    <div className="mb-3 space-y-2">
      {/* Top Wallet Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#3a2470] bg-gradient-to-r from-[#170e33]/90 via-[#1f1245]/90 to-[#120a2b]/90 p-3 shadow-xl backdrop-blur-md sm:px-4">
        {/* Left: User Identity & Real Balance */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#ffb800] to-[#ffda66] text-xl font-black text-black shadow-lg shadow-[#ffb800]/20">
            💰
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#b8a7e6]">
                {t("balance")}
              </span>
              {user ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Real Wallet
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-500/30">
                  Demo Mode
                </span>
              )}
            </div>
            <div className="text-xl font-black tracking-tight text-white sm:text-2xl">
              Rs.{" "}
              <span className="bg-gradient-to-r from-white via-[#ffe699] to-[#ffb800] bg-clip-text text-transparent">
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick Deposit / Withdraw Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <>
              <button
                type="button"
                onClick={() => setShowDepositModal(true)}
                className="group relative flex items-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3.5 py-2 text-xs font-black text-black shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-emerald-500 active:scale-95 sm:text-sm"
              >
                <span className="absolute -right-1 -top-2 rounded-full bg-[#ff3b30] px-1.5 text-[9px] font-bold leading-[14px] text-white">5%</span>
                <span>➕</span>
                <span>Deposit</span>
                <span className="hidden rounded bg-black/20 px-1 py-0.5 text-[10px] font-bold text-white sm:inline-block">
                  EasyPaisa / JazzCash
                </span>
              </button>

              <Link
                href="/player/wallet"
                className="flex items-center gap-1.5 rounded-xl border border-[#b8a7e6]/30 bg-[#2b1855]/70 px-3 py-2 text-xs font-black text-[#e9ddff] transition hover:border-[#ffb800] hover:text-white active:scale-95 sm:text-sm"
              >
                <span>💸</span>
                <span>Withdraw</span>
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-xl border border-[#ffb800]/50 bg-black/40 px-3 py-1.5 text-xs font-bold text-[#ffe0a3] transition hover:bg-[#ffb800]/10"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="btn-gold rounded-xl px-3 py-1.5 text-xs font-black"
              >
                Register to Play
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            title="Refresh balance"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#3a2470] bg-black/30 text-[#b8a7e6] transition hover:text-white disabled:opacity-50"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span>
          </button>
        </div>
      </div>

      {/* Low Balance Warning Ribbon when balance is low */}
      {user && balance < 10 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-red-500/10 to-amber-500/15 px-3 py-2 text-xs text-[#ffe0a3]">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>
              Aapka balance low hai (Rs. {balance.toLocaleString()}). Khelne aur jeetne ke liye <b>Easypaisa</b> ya <b>JazzCash</b> se deposit karein.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowDepositModal(true)}
            className="btn-gold relative rounded-lg px-2.5 py-1 text-xs font-black uppercase tracking-wider"
          >
            <span className="absolute -right-1 -top-2 rounded-full bg-[#ff3b30] px-1 text-[8px] font-bold leading-[13px] text-white">5%</span>
            Deposit Now
          </button>
        </div>
      )}

      {/* Quick Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-[#3a2470] bg-[#160c2e] p-5 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-[#3a2470] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">💰</span>
                <div>
                  <h3 className="text-lg font-black text-white">Deposit via Easypaisa / JazzCash</h3>
                  <p className="text-[11px] text-[#b8a7e6]">Apne account se transfer karein, balance foran add ho jayega.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDepositModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm hover:bg-white/20"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {/* JazzCash Info Box */}
              <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-3.5 transition hover:border-red-500/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-xs font-black text-white">
                      JC
                    </span>
                    <div>
                      <div className="text-xs font-bold text-red-200">JazzCash Account</div>
                      <div className="text-sm font-black text-white">winkox Official</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("03035433872", "jc")}
                    className="flex items-center gap-1 rounded-lg bg-red-600/30 px-2 py-1 text-[11px] font-bold text-red-200 hover:bg-red-600 hover:text-white"
                  >
                    <span>{copiedAccount === "jc" ? "✓ Copied!" : "📋 Copy"}</span>
                  </button>
                </div>
                <div className="mt-2 font-mono text-base font-black text-white bg-black/40 px-3 py-1.5 rounded-xl border border-red-500/20">
                  03035433872
                </div>
              </div>

              {/* Easypaisa Info Box */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 transition hover:border-emerald-500/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-black text-white">
                      EP
                    </span>
                    <div>
                      <div className="text-xs font-bold text-emerald-200">Easypaisa Account</div>
                      <div className="text-sm font-black text-white">winkox Official</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("03035433872", "ep")}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600/30 px-2 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-600 hover:text-white"
                  >
                    <span>{copiedAccount === "ep" ? "✓ Copied!" : "📋 Copy"}</span>
                  </button>
                </div>
                <div className="mt-2 font-mono text-base font-black text-white bg-black/40 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                  03035433872
                </div>
              </div>

              {/* Steps explanation */}
              <div className="rounded-xl bg-black/40 p-3 text-xs text-[#b8a7e6] space-y-1">
                <p><b>1.</b> Apne Easypaisa ya JazzCash app se is number par amount bhein.</p>
                <p><b>2.</b> Payment ke baad Wallet form mein TID aur screenshot attach karein.</p>
                <p><b>3.</b> Admin verify kar ke balance aapke account mein add kar dega.</p>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Link
                  href="/player/wallet"
                  onClick={() => setShowDepositModal(false)}
                  className="btn-gold flex items-center justify-center rounded-xl py-3 text-xs font-black uppercase text-black"
                >
                  Go to Wallet Form →
                </Link>
                <button
                  type="button"
                  onClick={() => setShowDepositModal(false)}
                  className="rounded-xl border border-[#3a2470] bg-black/30 py-3 text-xs font-bold text-[#b8a7e6] hover:text-white"
                >
                  Close & Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
