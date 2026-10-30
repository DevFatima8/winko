"use client";

import { resetPlayerHistoryAction } from "@/lib/actions";
import { HistoryActionForm } from "./HistoryActionForm";

export function PlayerDataResetForm({ userId, deleteAccount = false, isActive }: { userId?: string; deleteAccount?: boolean; isActive?: boolean }) {
  const phrase = deleteAccount ? "DELETE PLAYER" : userId ? "RESET PLAYER" : "RESET ALL PLAYERS";
  const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2.5 text-sm text-white";
  return <HistoryActionForm action={resetPlayerHistoryAction} confirmation={phrase} destination={deleteAccount ? "/admin/users" : undefined} label={deleteAccount ? "Delete player and all history" : userId ? "Reset this player's history and balance" : "Reset all player history and balances"}>
    {userId && <input type="hidden" name="userId" value={userId} />}
    <input type="hidden" name="mode" value={deleteAccount ? "delete" : "reset"} />
    {isActive && <p role="alert" className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">Ye account abhi active hai. Pehle upar Block button dabayein, phir ye form submit karein. Active account ka data delete nahi hoga.</p>}
    <p className="text-sm text-red-200">Back up the database first. Block {userId ? "this player" : "all player/referral-agent accounts"} and wait for ongoing requests to finish. Bets, wins, losses, deposits, withdrawals, commissions, held wins, login/session records and support history will be deleted. {deleteAccount ? "The login account will also be permanently deleted." : "Wallet, deposit/withdrawal totals and VIP progress will be zeroed. Login credentials and account settings remain; accounts stay blocked until you unblock them."} Staff, game configuration and payment accounts are preserved.</p>
    <label className="block text-xs text-[#b8a7e6]">Your current Agent password<input name="password" type="password" autoComplete="current-password" required className={`mt-1 ${input}`} /></label>
    <label className="block text-xs text-[#b8a7e6]">Type <b className="text-white">{phrase}</b> to confirm<input name="confirmation" required autoComplete="off" className={`mt-1 ${input}`} /></label>
  </HistoryActionForm>;
}
