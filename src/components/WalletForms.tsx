"use client";

import Link from "next/link";
import { useActionState, useState, useEffect } from "react";
import { depositAction, withdrawAction } from "@/lib/clientActions";
import type { ActionState } from "@/lib/actions";
import { useI18n } from "@/lib/i18n/client";
import { broadcastBalanceUpdate } from "@/lib/walletSync";
import { compressImage } from "@/lib/imageFile";
import { PaymentLogo } from "./PaymentLogo";
import { Zap, Smartphone, Check, TriangleAlert, CircleCheck, CircleX, Lightbulb, Lock, ArrowRight, X as XMark } from "lucide-react";

const Ic = "mr-1 inline-block -mt-0.5 shrink-0";

type Account = { id: string; provider: "jazzcash" | "easypaisa"; accountTitle: string; accountNumber: string; qrImage?: string | null };

const inputClass = "w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none placeholder:text-slate-500 focus:border-[#ffb800] transition";

export function DepositForm({ accounts = [], initialAmount }: { accounts?: Account[]; initialAmount?: number }) {
  const { t, isUr } = useI18n();
  const [tab, setTab] = useState<"gateway" | "manual">("manual");

  // Gateway state
  const [gwProvider, setGwProvider] = useState<"easypaisa" | "jazzcash">("easypaisa");
  const [gwMobile, setGwMobile] = useState("");
  const [gwDirect, setGwDirect] = useState(false);
  const [gwLoading, setGwLoading] = useState(false);
  const [gwError, setGwError] = useState<string | null>(null);
  const [gwSuccess, setGwSuccess] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | string>(initialAmount ?? 100);

  // Manual deposit state
  const [manualState, manualAction, manualPending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const proof = form.get("proofImage");
    if (proof instanceof File && proof.size > 0) {
      try {
        const dataUrl = await compressImage(proof, 1100, 0.8);
        form.set("proofImage", await (await fetch(dataUrl)).blob(), "proof.jpg");
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Screenshot process nahi ho saka." };
      }
    }
    return depositAction(prev, form);
  }, undefined);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  useEffect(() => {
    if (manualState?.success) {
      window.dispatchEvent(new CustomEvent("wx:data-refresh"));
      window.dispatchEvent(new CustomEvent("wx:session"));
      window.dispatchEvent(new CustomEvent("wx:balance-update"));
    }
  }, [manualState]);

  const copyToClipboard = (text: string, id: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleGatewayPay = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 10) {
      setGwError("Minimum deposit amount Rs. 10 hai.");
      return;
    }

    if (gwDirect && !gwMobile) {
      setGwError("Direct Mobile Push ke liye apna 03XXXXXXXXX number darj karein.");
      return;
    }

    setGwLoading(true);
    setGwError(null);
    setGwSuccess(null);

    try {
      const res = await fetch("/api/gateway/ngpay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numAmount,
          provider: gwProvider,
          senderNumber: gwMobile,
          direct: gwDirect,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setGwError(data.error || "Payment gateway se connection fail ho gaya.");
        setGwLoading(false);
        return;
      }

      if (data.payUrl) {
        setGwSuccess("Payment gateway par redirect kiya ja raha hai...");
        window.location.href = data.payUrl;
      } else {
        setGwSuccess(data.message || `Order create ho gaya (${data.merchantOrderNo}).`);
      }
    } catch {
      setGwError("Gateway server se connect nahi ho saka. Baraye meherbani Direct Manual Transfer use karein.");
    } finally {
      setGwLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Method Tabs */}
      {/* Gateway tab disabled: deposits are manual QR transfers approved by the referring admin */}
      {false && (
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/40 p-1.5 ring-1 ring-slate-800">
        <button
          type="button"
          onClick={() => { setTab("gateway"); setGwError(null); }}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider transition ${
            tab === "gateway"
              ? "bg-gradient-to-r from-amber-500 to-[#ffb800] text-black shadow-lg shadow-amber-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span><Zap size={13} className={Ic} />Instant Auto Pay</span>
          <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] font-bold">Auto</span>
        </button>

        <button
          type="button"
          onClick={() => { setTab("manual"); setGwError(null); }}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider transition ${
            tab === "manual"
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-black shadow-lg shadow-emerald-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <span><Smartphone size={13} className={Ic} />Direct Manual Transfer</span>
          <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] font-bold">100% Reliable</span>
        </button>
      </div>
      )}

      {/* TAB 1: INSTANT ONLINE GATEWAY */}
      {tab === "gateway" && (
        <form onSubmit={handleGatewayPay} className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-black text-amber-200">
                Online Auto Payment Gateway
              </span>
            </div>
            <span className="text-[11px] font-bold text-[#ffb800]">Min Rs. 10</span>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#e9ddff]">
              1. Choose Provider:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setGwProvider("easypaisa")}
                className={`cursor-pointer rounded-2xl border p-3.5 transition ${
                  gwProvider === "easypaisa"
                    ? "border-emerald-500 bg-emerald-950/40 shadow-lg shadow-emerald-500/20"
                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#00a651] text-xs font-black text-white">
                      EP
                    </span>
                    <span className="text-sm font-black text-white">Easypaisa</span>
                  </div>
                  {gwProvider === "easypaisa" && (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">
                      <Check size={11} className="mr-0.5 inline-block -mt-0.5" />Active
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-emerald-200/80">Online Checkout / Direct</p>
              </div>

              <div
                onClick={() => setGwProvider("jazzcash")}
                className={`cursor-pointer rounded-2xl border p-3.5 transition ${
                  gwProvider === "jazzcash"
                    ? "border-red-500 bg-red-950/40 shadow-lg shadow-red-500/20"
                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#c8102e] text-xs font-black text-white">
                      JC
                    </span>
                    <span className="text-sm font-black text-white">JazzCash</span>
                  </div>
                  {gwProvider === "jazzcash" && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                      <Check size={11} className="mr-0.5 inline-block -mt-0.5" />Active
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-red-200/80">Online Checkout / Direct</p>
              </div>
            </div>
          </div>

          {/* Amount Input with Quick Presets */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                2. Deposit Amount (PKR)
              </label>
              <span className="text-xs font-bold text-[#ffb800]">Min: Rs. 10</span>
            </div>
            <input
              type="number"
              min={10}
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="100"
              className={inputClass}
            />
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {[10, 50, 100, 500, 1000, 5000].map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setAmount(preset)}
                  className={`rounded-lg py-1.5 text-xs font-bold transition ${
                    Number(amount) === preset
                      ? "bg-[#ffb800] text-black shadow-md shadow-[#ffb800]/20"
                      : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  Rs. {preset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Number */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              3. Mobile Number (Optional for redirect, required for Direct)
            </label>
            <input
              type="text"
              value={gwMobile}
              onChange={(e) => setGwMobile(e.target.value)}
              placeholder="03XXXXXXXXX"
              className={inputClass}
            />
          </div>

          {/* Direct Option Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={gwDirect}
              onChange={(e) => setGwDirect(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-[#ffb800] focus:ring-0"
            />
            <span>Direct Mobile Push (Payment request phone par bhejein)</span>
          </label>

          {gwError && (
            <div className="space-y-2 rounded-2xl border border-red-500/40 bg-red-950/40 p-3.5">
              <div className="flex items-start gap-2 text-xs text-red-300">
                <TriangleAlert size={16} className="shrink-0" />
                <span>{gwError}</span>
              </div>
              <button
                type="button"
                onClick={() => setTab("manual")}
                className="w-full rounded-xl bg-emerald-500/20 py-2 text-xs font-black text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition"
              >
                <ArrowRight size={14} className={Ic} />Direct Manual Transfer Tab Par Switch Karein (100% Working)
              </button>
            </div>
          )}

          {gwSuccess && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <CircleCheck size={15} className={Ic} />{gwSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={gwLoading}
            className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black uppercase tracking-wider text-black disabled:opacity-60"
          >
            {gwLoading ? (
              <span>Connecting Gateway...</span>
            ) : (
              <span>
                <Zap size={14} className={Ic} />Pay Rs. {Number(amount).toLocaleString()} via {gwProvider === "easypaisa" ? "Easypaisa" : "JazzCash"}
              </span>
            )}
          </button>
        </form>
      )}

      {/* TAB 2: DIRECT MANUAL TRANSFER */}
      {tab === "manual" && (
        <form action={manualAction} className="space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <Lightbulb size={14} className={Ic} /> <b>QR Transfer:</b> QR scan kar ke ya number par paise bhejein, phir Transaction ID (TID) ya screenshot submit karein. Admin approve karte hi balance foran add ho jayega.
          </div>

          {/* Accounts Selector */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              1. {t("selectMethod")}:
            </label>
            {accounts.length === 0 ? (
              <p className="rounded-xl bg-slate-950 p-4 text-sm text-slate-400">{t("noAccounts")}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {accounts.map((a) => {
                  const isSelected = (selectedAccountId ?? accounts[0]?.id) === a.id;
                  const isJC = a.provider === "jazzcash";
                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAccountId(a.id)}
                      className={`cursor-pointer rounded-2xl border p-3.5 transition ${
                        isSelected
                          ? isJC
                            ? "border-red-500 bg-red-950/40 shadow-lg shadow-red-500/20"
                            : "border-emerald-500 bg-emerald-950/40 shadow-lg shadow-emerald-500/20"
                          : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-black text-white ${isJC ? "bg-[#c8102e]" : "bg-[#00a651]"}`}>
                          {isJC ? "JazzCash" : "Easypaisa"}
                        </span>
                        {isSelected && (
                          <span className="text-xs font-bold text-[#ffb800]"><Check size={12} className={Ic} />Selected</span>
                        )}
                      </div>
                      <div className="mt-2 text-sm font-bold text-white">{a.accountTitle}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-mono text-base font-black text-[#ffb800]">{a.accountNumber}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(a.accountNumber, a.id);
                          }}
                          className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700"
                        >
                          {copiedId === a.id ? <><Check size={12} className={Ic} />Copied</> : "Copy"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <input type="hidden" name="paymentAccountId" value={selectedAccount?.id ?? ""} />
          </div>

          {selectedAccount && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-300 space-y-1">
              <div className="text-slate-400">Receiving Account Details:</div>
              <div className="flex items-center justify-between text-sm">
                <span>Account Title: <b className="text-white">{selectedAccount.accountTitle}</b></span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Till ID: <b className="font-mono text-emerald-400">{selectedAccount.accountNumber}</b></span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(selectedAccount.accountNumber, "detail")}
                  className="rounded bg-emerald-600/30 px-2 py-0.5 text-[11px] font-bold text-emerald-300"
                >
                  {copiedId === "detail" ? <><Check size={12} className={Ic} />Copied</> : "Copy"}
                </button>
              </div>
              {selectedAccount.qrImage && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <div className="text-slate-400">Scan QR to pay</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedAccount.qrImage} alt="Payment QR" className="h-auto w-full max-w-[220px] rounded-xl bg-white object-contain p-2" />
                </div>
              )}
            </div>
          )}

          {/* Amount Input */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                2. Deposit Amount (PKR)
              </label>
              <span className="text-xs font-bold text-[#ffb800]">Min: Rs. 10</span>
            </div>
            <input
              name="amount"
              type="number"
              min={10}
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="1000"
              className={inputClass}
            />
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {[100, 500, 1000, 2000, 5000, 10000].map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setAmount(preset)}
                  className={`rounded-lg py-1.5 text-xs font-bold transition ${
                    Number(amount) === preset
                      ? "bg-[#ffb800] text-black shadow-md shadow-[#ffb800]/20"
                      : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  Rs. {preset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Sender Number */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              3. {t("yourSenderNumber")} (03XXXXXXXXX)
            </label>
            <input
              name="senderNumber"
              required
              placeholder="03001234567"
              className={inputClass}
            />
          </div>

          {/* Reference ID / TID */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              4. {t("tid")} (Transaction ID)
            </label>
            <input
              name="referenceId"
              placeholder="e.g. 1234567890"
              className={inputClass}
            />
          </div>

          {/* Screenshot proof */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              5. Payment Screenshot <span className="text-xs text-slate-500">(TID ya screenshot lazmi)</span>
            </label>
            <input
              name="proofImage"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const url = URL.createObjectURL(file);
                  setPreviewImage(url);
                } else {
                  setPreviewImage(null);
                }
              }}
              className="w-full text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-[#ffb800] file:px-3 file:py-2 file:font-black file:text-black hover:file:bg-amber-400"
            />
            {previewImage && (
              <div className="mt-2 relative inline-block">
                <img src={previewImage} alt="Preview" className="h-24 w-auto rounded-xl border border-slate-700 object-cover" />
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="absolute -top-1 -right-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white"
                >
                  <XMark size={14} aria-label="Remove" />
                </button>
              </div>
            )}
          </div>

          {manualState?.error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <CircleX size={15} className={Ic} />{manualState.error}
            </div>
          )}

          {manualState?.success && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <CircleCheck size={15} className={Ic} />{manualState.success}
            </div>
          )}

          <button
            type="submit"
            disabled={manualPending}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-sm font-black uppercase tracking-wider text-black shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60"
          >
            {manualPending ? t("submitting") : t("submitDeposit")}
          </button>
        </form>
      )}

      <p className="text-center text-[11px] text-slate-500">
        <Lock size={12} className={Ic} />100% Secure & Verified Payments · Winkox Single Gaming Wallet
      </p>
    </div>
  );
}

export function WithdrawForm({
  balance,
  hasPin,
  limits,
}: {
  balance: number;
  hasPin: boolean;
  limits?: {
    name: string;
    daily: number;
    perMax: number;
    usedToday: number;
    min: number;
    withdrawalsToday?: number;
    withdrawalsPerDay?: number;
  };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(withdrawAction, undefined);
  const { t } = useI18n();
  const [provider, setProvider] = useState<"jazzcash" | "easypaisa">("jazzcash");
  const minAmount = limits?.min ?? 1000;
  const [amount, setAmount] = useState<number | string>(minAmount);

  useEffect(() => {
    if (state?.success) {
      window.dispatchEvent(new CustomEvent("wx:balance-update"));
      window.dispatchEvent(new CustomEvent("wx:session"));
    }
  }, [state]);

  const setAmountPercent = (pct: number) => {
    const val = Math.max(minAmount, Math.floor((balance * pct) / 100));
    setAmount(val);
  };

  return (
    <form action={action} className="space-y-4">
      {/* Balance Banner */}
      <div className="flex items-center justify-between rounded-xl border border-[#3a2470] bg-black/40 p-3">
        <span className="text-sm text-slate-300">{t("availableBalance")}:</span>
        <span className="text-xl font-black text-[#ffb800]">
          Rs. {Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {limits && (
        <div className="rounded-xl bg-black/30 p-3 text-xs text-[#b8a7e6] ring-1 ring-[#3a2470]">
          <b className="text-white">{limits.name}</b> · {t("dailyLimit")}:{" "}
          <b className="text-[#ffb800]">
            {limits.daily ? `Rs. ${limits.daily.toLocaleString()}` : "Unlimited"}
          </b>
          {limits.daily > 0 && ` (Remaining: Rs. ${Math.max(0, limits.daily - limits.usedToday).toLocaleString()})`} ·{" "}
          Min: Rs. {limits.min}.{" "}
          <Link href="/player/profile" className="text-[#c4b5fd] underline">
            {t("raiseVip")}
          </Link>
        </div>
      )}

      {!hasPin && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <TriangleAlert size={14} className={Ic} />{t("setPinFirst")}{" "}
          <Link href="/player/profile" className="font-bold underline text-white">
            Profile settings
          </Link>{" "}
          se 4-digit PIN banayein.
        </div>
      )}

      {/* Select Provider */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">
          Select Withdrawal Provider:
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(["jazzcash", "easypaisa"] as const).map((p) => {
            const isSelected = provider === p;
            const isJC = p === "jazzcash";
            return (
              <button
                type="button"
                key={p}
                onClick={() => setProvider(p)}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? isJC
                      ? "border-red-500 bg-red-950/40 text-white shadow-lg shadow-red-500/20"
                      : "border-emerald-500 bg-emerald-950/40 text-white shadow-lg shadow-emerald-500/20"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                }`}
              >
                <PaymentLogo provider={isJC ? "jazzcash" : "easypaisa"} height={24} />
                <span className="sr-only">
                  {isJC ? "JazzCash" : "Easypaisa"}
                </span>
              </button>
            );
          })}
        </div>
        <input type="hidden" name="provider" value={provider} />
      </div>

      {/* Account Holder Name */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          Account Holder Name (Jis naam par JazzCash/Easypaisa account registered hai)
        </label>
        <input
          name="holderName"
          required
          placeholder="e.g. Muhammad Ali"
          className={inputClass}
        />
      </div>

      {/* Account Number */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          Receiving Account Number (03XXXXXXXXX)
        </label>
        <input
          name="accountNumber"
          required
          placeholder="03001234567"
          className={inputClass}
        />
      </div>

      {/* Amount with Quick Presets */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          Withdrawal Amount (Min Rs. {minAmount.toLocaleString()})
        </label>
        <input
          name="amount"
          type="number"
          min={minAmount}
          max={balance}
          required
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          placeholder={String(minAmount)}
          className={inputClass}
        />
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => setAmount(minAmount)}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            Min ({minAmount})
          </button>
          <button
            type="button"
            onClick={() => setAmountPercent(50)}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            50%
          </button>
          <button
            type="button"
            onClick={() => setAmount(Math.floor(balance))}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-[#ffb800] hover:bg-slate-800"
          >
            All / Max
          </button>
        </div>
      </div>

      {/* Withdrawal PIN */}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          {t("withdrawPin")} (4-Digit PIN)
        </label>
        <input
          name="pin"
          inputMode="numeric"
          maxLength={4}
          required
          placeholder="••••"
          className={inputClass}
        />
      </div>

      {state?.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <CircleX size={15} className={Ic} />{state.error}
        </div>
      )}

      {state?.success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <CircleCheck size={15} className={Ic} />{state.success}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-gradient-to-r from-red-600 to-rose-700 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-red-600/20 transition hover:from-red-500 hover:to-rose-600 disabled:opacity-60"
      >
        {pending ? t("submitting") : t("requestWithdraw")}
      </button>
    </form>
  );
}
