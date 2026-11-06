"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, RefreshCw, Headset, History } from "lucide-react";
import { DepositFlow } from "@/components/DepositFlow";
import { WithdrawRequest } from "@/components/WithdrawRequest";
import { ReferralCommissionCard } from "@/components/ReferralCommissionCard";
import { useI18n } from "@/lib/i18n/client";
import { getCurrentUser } from "@/lib/auth";
import { usePage } from "@/lib/useDb";
import { PkFlag } from "@/components/PlayerBalance";
import styles from "@/components/DepositFlow.module.css";

function Balance({ initial }: { initial: number }) {
  const [balance, setBalance] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const user = await getCurrentUser(true);
      if (!user) throw new Error("Balance refresh nahi ho saka. Dobara login karein.");
      setBalance(user.balance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Balance refresh nahi ho saka.");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-white">
        <span>Balance</span>
        <span className="flex min-w-0 items-center gap-1 border border-white/15 bg-black/25 px-1.5">
          <PkFlag className="h-6 w-6" />
          <b className="break-all text-[18px] text-[#ffc933] underline">{balance.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          <button type="button" onClick={refresh} disabled={busy} aria-label="Refresh balance" className="flex w-7 shrink-0 items-center justify-center text-[#ffc933]"><RefreshCw size={18} className={busy ? "animate-spin" : ""} /></button>
        </span>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export default function WalletPageClient({ mode = "deposit", params, searchParams }: { mode?: "deposit" | "withdraw"; params?: Record<string, string>; searchParams?: Record<string, string> }) {
  const { t } = useI18n();
  const requestedAmount = Number(searchParams?.amount);
  const initialAmount = Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : undefined;
  return usePage(async () => {
    const response = await fetch("/api/player/wallet", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Wallet data load nahi ho saka.");
    const { me, accounts, limits, minDeposit, withdrawalAccounts } = data;
    if (mode === "withdraw") return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pb-6">
        <WithdrawRequest key={me.balance} balance={me.balance} hasPin={me.hasPin} limits={limits} initialAccounts={withdrawalAccounts} />
        <ReferralCommissionCard initial={data.holds.referralClaimable} locked={data.holds.referralLocked} earned={me.commissionEarned} />
      </div>
    );
    return (
      <div className={`${styles.page} mx-auto w-full max-w-2xl space-y-4 px-2 pb-6 text-white sm:px-4`}>
        <header className="relative flex h-14 items-center justify-center border-b border-white/20">
          <Link href="/player" aria-label="Back" className="absolute left-0 p-2 text-slate-300"><ArrowLeft size={20} /></Link>
          <h1 className="text-xl font-medium text-white">{t("deposit")}</h1>
          <div className="absolute right-0 flex gap-4 text-[#ffc933]">
            <button type="button" aria-label="Deposit support" onClick={() => window.dispatchEvent(new CustomEvent("wx:open-support"))}><Headset size={23} /></button>
            <Link href="/player/records?type=deposit" aria-label="Deposit history"><History size={23} /></Link>
          </div>
        </header>
        <Balance initial={me.balance} />
        <DepositFlow accounts={accounts} qrAccount={data.qrAccount} initialAmount={initialAmount} minDeposit={minDeposit} firstDepositBonusEligible={data.firstDepositBonusEligible === true} />
      </div>
    );
  }, [mode, JSON.stringify(params ?? {}), JSON.stringify(searchParams ?? {})]);
}
