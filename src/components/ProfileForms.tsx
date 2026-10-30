"use client";

import { useActionState, useEffect, useState } from "react";
import { setWithdrawPinAction, changePasswordAction, type ActionState } from "@/lib/actions";
import { useI18n } from "@/lib/i18n/client";

const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[#d946ef]";
const Msg = ({ s }: { s: ActionState }) => (!s ? null : s.error ? <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{s.error}</p> : <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{s.success}</p>);

export function PinForm({ hasPin, onSuccess }: { hasPin: boolean; onSuccess?: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setWithdrawPinAction, undefined);
  const { t } = useI18n();
  useEffect(() => {
    if (state?.success) onSuccess?.();
  }, [state, onSuccess]);
  return (
    <form action={action} className="space-y-3">
      {hasPin && <input name="current" inputMode="numeric" maxLength={4} placeholder={t("oldPin")} className={input} />}
      <input name="pin" inputMode="numeric" maxLength={4} required placeholder={hasPin ? t("newPin") : t("createPin")} className={input} />
      <input name="confirm" inputMode="numeric" maxLength={4} required placeholder={t("confirmPin")} className={input} />
      <Msg s={state} />
      <button disabled={pending} className="btn-gold w-full rounded-xl py-2.5 font-black disabled:opacity-60">{hasPin ? t("changePin") : t("setPinBtn")}</button>
    </form>
  );
}
export function PasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(changePasswordAction, undefined);
  const { t } = useI18n();
  return (
    <form action={action} className="space-y-3">
      <input name="current" type="password" required placeholder={t("currentPassword")} className={input} />
      <input name="next" type="password" required placeholder={t("newPassword")} className={input} />
      <Msg s={state} />
      <button disabled={pending} className="btn-violet w-full rounded-xl py-2.5 font-bold disabled:opacity-60">{t("changePasswordBtn")}</button>
    </form>
  );
}
export function CopyLink({ link }: { link: string }) {
  const [ok, setOk] = useState(false);
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <input readOnly value={link} className={input + " text-xs"} />
      <button onClick={() => { navigator.clipboard.writeText(link); setOk(true); setTimeout(() => setOk(false), 1500); }} className="btn-gold shrink-0 rounded-xl px-4 text-sm font-black">{ok ? t("copied") : t("copy")}</button>
      <a href={`https://wa.me/?text=${encodeURIComponent("winkox par join karo aur bonus lo! " + link)}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl bg-[#25d366] px-3 text-sm font-bold text-white flex items-center">{t("share")}</a>
    </div>
  );
}
