"use client";

import { useActionState, useState } from "react";
import { saveVipLevelsAction, saveSettingsAction, sendNotificationAction, saveHelpArticleAction, type ActionState } from "../../lib/actions";

const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef]";
const label = "mb-1 block text-xs font-semibold text-[#b8a7e6]";
function Msg({ s }: { s: ActionState }) {
  if (!s) return null;
  return s.error ? <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{s.error}</p> : <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{s.success}</p>;
}

/* ---------- VIP ---------- */
export type VipRow = { level: number; name: string; minDeposit: number; nextLevelBonus: number; dailyWithdrawLimit: number; withdrawalsPerDay: number; perWithdrawMax: number; minWithdraw: number };
export function VipForm({ levels }: { levels: VipRow[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveVipLevelsAction, undefined);
  const [rows, setRows] = useState<VipRow[]>(levels);
  return (
    <form action={action} className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-[#6f5fa3]"><tr><th className="pb-2 pr-2">Level</th><th className="pb-2 pr-2">VIP name</th><th className="pb-2 pr-2">Deposit (Rs.)</th><th className="pb-2 pr-2">Next-level bonus</th><th className="pb-2 pr-2">Daily withdrawal limit</th><th className="pb-2 pr-2">Withdrawals per day</th><th className="pb-2 pr-2">Max per withdrawal</th><th className="pb-2 pr-2">Min withdrawal</th><th className="pb-2"></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2 font-black text-[#ffb800]">{i}</td>
                <td className="py-1 pr-2"><input name={`name_${i}`} defaultValue={r.name} className={input} /></td>
                <td className="py-1 pr-2"><input name={`min_${i}`} type="number" defaultValue={r.minDeposit} className={input} /></td>
                <td className="py-1 pr-2"><input name={`bonus_${i}`} type="number" min={0} defaultValue={r.nextLevelBonus} className={input} /></td>
                <td className="py-1 pr-2"><input name={`daily_${i}`} type="number" defaultValue={r.dailyWithdrawLimit} className={input} /></td>
                <td className="py-1 pr-2"><input name={`count_${i}`} type="number" min={0} defaultValue={r.withdrawalsPerDay} className={input} /></td>
                <td className="py-1 pr-2"><input name={`per_${i}`} type="number" defaultValue={r.perWithdrawMax} className={input} /></td>
                <td className="py-1 pr-2"><input name={`minw_${i}`} type="number" defaultValue={r.minWithdraw} className={input} /></td>
                <td className="py-1">{i === rows.length - 1 && rows.length > 1 && <button type="button" onClick={() => setRows(rows.slice(0, -1))} className="rounded-lg bg-red-500/15 px-2 py-1 text-xs text-red-300"></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.length < 16 && <button type="button" onClick={() => setRows([...rows, { level: rows.length, name: `Level ${rows.length}`, minDeposit: (rows[rows.length - 1]?.minDeposit ?? 0) * 2 || 300, nextLevelBonus: 0, dailyWithdrawLimit: 0, withdrawalsPerDay: 0, perWithdrawMax: 0, minWithdraw: 500 }])} className="btn-outline rounded-xl px-4 py-2 text-sm font-bold">+ Add level</button>}
        <button disabled={pending} className="btn-gold rounded-xl px-6 py-2 text-sm font-black disabled:opacity-60">{pending ? "Saving..." : "Save VIP levels"}</button>
      </div>
      <Msg s={state} />
    </form>
  );
}

/* ---------- Settings ---------- */
export type SettingsShape = {
  support: { enabled: boolean; is247: boolean; startHour: number; endHour: number; offlineMessage: string; welcomeMessage: string };
  links: { whatsapp: string; whatsappChannel: string; telegram: string; telegramChannel: string; facebook: string; instagram: string; youtube: string };
  app: { androidUrl: string; iosUrl: string; version: string };
  referral: { signupBonus: number };
  wallet: { minDeposit: number; minWithdraw: number };
  fakeGateway: { enabled: boolean; autoWithdraw: boolean; testOtp: string; maxPerTxn: number; dailyLimit: number; label: string };
};
export function SettingsForm({ s }: { s: SettingsShape }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSettingsAction, undefined);
  const [is247, set247] = useState(s.support.is247);
  return (
    <form action={action} className="space-y-6">
      <section className="wx-card rounded-2xl p-4">
        <h2 className="mb-3 font-bold text-white">Live Support hours</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" name="support_enabled" defaultChecked={s.support.enabled} className="accent-[#d946ef]" /> Live chat enabled</label>
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" name="support_247" checked={is247} onChange={(e) => set247(e.target.checked)} className="accent-[#d946ef]" /> 24/7 service</label>
          <label className="block"><span className={label}>Start hour (PKT, 0–23)</span><input name="support_start" type="number" min={0} max={23} defaultValue={s.support.startHour} disabled={is247} className={input} /></label>
          <label className="block"><span className={label}>End hour (PKT, 1–24)</span><input name="support_end" type="number" min={1} max={24} defaultValue={s.support.endHour} disabled={is247} className={input} /></label>
          <label className="block sm:col-span-2"><span className={label}>Welcome message (pehle message par)</span><input name="support_welcome" defaultValue={s.support.welcomeMessage} className={input} /></label>
          <label className="block sm:col-span-2"><span className={label}>Offline auto-reply (hours ke bahar)</span><textarea name="support_offline" rows={2} defaultValue={s.support.offlineMessage} className={input} /></label>
        </div>
      </section>

      <section className="wx-card rounded-2xl p-4">
        <h2 className="mb-3 font-bold text-white">Social & Channel links</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>WhatsApp support (wa.me link)</span><input name="whatsapp" defaultValue={s.links.whatsapp} placeholder="https://wa.me/92300..." className={input} /></label>
          <label className="block"><span className={label}>WhatsApp Channel (lobby floating button)</span><input type="url" name="whatsappChannel" defaultValue={s.links.whatsappChannel} placeholder="https://whatsapp.com/channel/..." className={input} /></label>
          <label className="block"><span className={label}>Telegram support</span><input name="telegram" defaultValue={s.links.telegram} placeholder="https://t.me/..." className={input} /></label>
          <label className="block"><span className={label}>Telegram Channel</span><input name="telegramChannel" defaultValue={s.links.telegramChannel} placeholder="https://t.me/..." className={input} /></label>
          <label className="block"><span className={label}>Facebook</span><input name="facebook" defaultValue={s.links.facebook} className={input} /></label>
          <label className="block"><span className={label}>Instagram</span><input name="instagram" defaultValue={s.links.instagram} className={input} /></label>
          <label className="block"><span className={label}>YouTube</span><input name="youtube" defaultValue={s.links.youtube} className={input} /></label>
        </div>
      </section>

      <section className="wx-card rounded-2xl p-4">
        <h2 className="mb-3 font-bold text-white">Mobile App</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className={label}>Android APK / Play Store URL</span><input name="androidUrl" defaultValue={s.app.androidUrl} placeholder="https://.../winkox.apk" className={input} /></label>
          <input type="hidden" name="iosUrl" value={s.app.iosUrl} />
          <label className="block"><span className={label}>App version</span><input name="appVersion" defaultValue={s.app.version} className={input} /></label>
        </div>
        <p className="mt-2 text-xs text-[#6f5fa3]">Website khud bhi installable app (PWA) hai — &quot;Download&quot; par tap karne se phone par app install ho jati hai. APK link dene par download button us par jayega.</p>
      </section>

      <section className="wx-card rounded-2xl p-4">
        <h2 className="mb-3 font-bold text-white">Referral & Agent commission</h2>
        <p className="mb-3 text-sm text-[#b8a7e6]">All referrers, including agents, earn 1.5% of a client&apos;s first approved deposit. Bet commission and the old fixed deposit bonus are disabled.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Signup bonus (Rs.)</span><input name="signupBonus" type="number" defaultValue={s.referral.signupBonus} className={input} /></label>
        </div>
      </section>

      <section className="wx-card rounded-2xl p-4">
        <h2 className="mb-3 font-bold text-white">Wallet limits</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>Minimum deposit (Rs.)</span><input name="minDeposit" type="number" defaultValue={s.wallet.minDeposit} className={input} /></label>
          <label className="block"><span className={label}>Minimum withdraw (Rs.)</span><input name="minWithdraw" type="number" defaultValue={s.wallet.minWithdraw} className={input} /></label>
        </div>
      </section>

      <section className="wx-card rounded-2xl border-2 border-dashed border-[#ffb800]/50 p-4">
        <h2 className="mb-1 font-bold text-white">Test Payment Gateway (Fake / Sandbox)</h2>
        <p className="mb-3 text-xs text-[#b8a7e6]">ON hone par clients ko Wallet mein &quot;Instant Deposit (Test)&quot; option milta hai — JazzCash/Easypaisa jaisa payment page, OTP daalte hi balance <b className="text-white">turant</b> add (koi asli paisa nahi, admin approval nahi). Games test karne ke liye. Live jaate waqt OFF kar dein.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" name="fg_enabled" defaultChecked={s.fakeGateway.enabled} className="accent-[#d946ef]" /> Gateway enabled</label>
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" name="fg_autoWithdraw" defaultChecked={s.fakeGateway.autoWithdraw} className="accent-[#d946ef]" /> Instant test withdraw bhi</label>
          <label className="block"><span className={label}>Test OTP</span><input name="fg_otp" defaultValue={s.fakeGateway.testOtp} className={input} /></label>
          <label className="block"><span className={label}>Max per transaction (Rs.)</span><input name="fg_max" type="number" defaultValue={s.fakeGateway.maxPerTxn} className={input} /></label>
          <label className="block"><span className={label}>Daily limit per user (Rs.)</span><input name="fg_daily" type="number" defaultValue={s.fakeGateway.dailyLimit} className={input} /></label>
          <label className="block"><span className={label}>Button label</span><input name="fg_label" defaultValue={s.fakeGateway.label} className={input} /></label>
        </div>
      </section>

      <Msg s={state} />
      <button disabled={pending} className="btn-gold rounded-xl px-6 py-2.5 text-sm font-black disabled:opacity-60">{pending ? "Saving..." : "Save settings"}</button>
    </form>
  );
}

/* ---------- Notification ---------- */
export function NotificationForm({ level = 2 }: { level?: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendNotificationAction, undefined);
  const [aud, setAud] = useState(level < 2 ? "team" : "all");
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-3"><span className={label}>Title</span><input name="title" required placeholder="e.g. Weekend Bonus!" className={input} /></label>
        <label className="block sm:col-span-3"><span className={label}>Message</span><textarea name="body" required rows={3} placeholder="Sab users ko ye message jayega..." className={input} /></label>
        <label className="block"><span className={label}>Type</span><select name="type" className={input}><option value="info">Info</option><option value="promo">Promo</option><option value="success">Success</option><option value="warning">Warning</option></select></label>
        <label className="block"><span className={label}>Audience</span><select name="audience" value={aud} onChange={(e) => setAud(e.target.value)} className={input}>{level < 2 ? <><option value="team">My team</option><option value="user">Single user (by phone)</option></> : <><option value="all">All platform users</option><option value="clients">Clients only</option><option value="agents">Agents only</option><option value="user">Single user (by phone)</option></>}</select></label>
        {aud === "user" && <label className="block"><span className={label}>User phone</span><input name="phone" placeholder="03XXXXXXXXX" className={input} /></label>}
      </div>
      <Msg s={state} />
      <button disabled={pending} className="btn-gold rounded-xl px-6 py-2.5 text-sm font-black disabled:opacity-60">{pending ? "Sending..." : "Send notification"}</button>
    </form>
  );
}

/* ---------- Help article ---------- */
export type HelpShape = { id?: string; title: string; category: string; order: number; isActive: boolean; steps: { text: string; image: string }[] };
export function HelpArticleForm({ a }: { a: HelpShape }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveHelpArticleAction, undefined);
  const [steps, setSteps] = useState(a.steps.length ? a.steps : [{ text: "", image: "" }]);
  const upd = (i: number, k: "text" | "image", v: string) => setSteps(steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <form action={action} className="space-y-4">
      {a.id && <input type="hidden" name="id" value={a.id} />}
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block sm:col-span-2"><span className={label}>Title</span><input name="title" required defaultValue={a.title} className={input} /></label>
        <label className="block"><span className={label}>Category</span><select name="category" defaultValue={a.category} className={input}>{["Deposit", "Withdraw", "Games", "Account", "General"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="block"><span className={label}>Order</span><input name="order" type="number" defaultValue={a.order} className={input} /></label>
        <label className="flex items-center gap-2 text-sm text-white sm:col-span-4"><input type="checkbox" name="isActive" defaultChecked={a.isActive} className="accent-[#d946ef]" /> Published (users ko nazar aaye)</label>
      </div>
      <div className="space-y-3">
        <div className="text-sm font-bold text-white">Steps (description + picture URL)</div>
        {steps.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-[#3a2470] bg-black/20 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block"><span className={label}>Step {i + 1} — description</span><textarea name={`step_text_${i}`} rows={2} value={s.text} onChange={(e) => upd(i, "text", e.target.value)} className={input} /></label>
            <label className="block"><span className={label}>Picture URL (optional)</span><input name={`step_image_${i}`} value={s.image} onChange={(e) => upd(i, "image", e.target.value)} placeholder="https://.../screenshot.png" className={input} />{s.image && <img src={s.image} alt="" className="mt-2 h-20 rounded-lg object-cover" />}</label>
            <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="self-start rounded-lg bg-red-500/15 px-2 py-1 text-xs text-red-300"></button>
          </div>
        ))}
        {steps.length < 20 && <button type="button" onClick={() => setSteps([...steps, { text: "", image: "" }])} className="btn-outline rounded-xl px-4 py-2 text-sm font-bold">+ Add step</button>}
      </div>
      <p className="text-xs text-[#6f5fa3]">Picture upload: image ko kisi bhi image host (imgbb.com / postimages.org / Google Drive public link) par upload kar ke URL yahan paste karein.</p>
      <Msg s={state} />
      <button disabled={pending} className="btn-gold rounded-xl px-6 py-2.5 text-sm font-black disabled:opacity-60">{pending ? "Saving..." : "Save article"}</button>
    </form>
  );
}
