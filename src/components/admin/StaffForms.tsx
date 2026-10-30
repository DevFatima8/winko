"use client";

import { useActionState, useState } from "react";
import { createSubAdminAction, updateStaffAction, changeOwnPasswordAction, type ActionState } from "../../lib/actions";

const input = "w-full rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef]";
const label = "mb-1 block text-xs font-semibold text-[#b8a7e6]";
const Msg = ({ s }: { s: ActionState }) => (!s ? null : s.error ? <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{s.error}</p> : <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-300">{s.success}</p>);

function genPass() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; let p = ""; for (let i = 0; i < 10; i++) p += c[Math.floor(Math.random() * c.length)]; return p; }

export function CreateStaffForm({ canCreateSuper }: { canCreateSuper: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createSubAdminAction, undefined);
  const [pw, setPw] = useState(genPass());
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block"><span className={label}>Admin name</span><input name="name" required placeholder="e.g. Ahmed (Support)" className={input} /></label>
        <label className="block"><span className={label}>Phone (optional)</span><input name="phone" placeholder="03XXXXXXXXX" className={input} /></label>
        <label className="block"><span className={label}>Password (aap set karein)</span>
          <div className="flex gap-1"><input name="password" required value={pw} onChange={(e) => setPw(e.target.value)} className={input} /><button type="button" onClick={() => setPw(genPass())} className="btn-outline shrink-0 rounded-xl px-2 text-xs">↻</button></div>
        </label>
        <label className="block"><span className={label}>Role</span>
          <select name="role" className={input}><option value="subadmin">Sub Admin</option>{canCreateSuper && <option value="admin">Super Admin</option>}</select>
        </label>
      </div>
      <p className="text-xs text-[#6f5fa3]">Login ID automatically banegi (WX-ADM-0002 …). Sub-admin isi ID (ya phone) + is password se login karega. Wo khud signup nahi kar sakta.</p>
      {!canCreateSuper && <p className="text-xs text-amber-200">Super Admin sirf Sub Admin create kar sakta hai. Naya Super Admin sirf Agent bana sakta hai.</p>}
      <Msg s={state} />
      <button disabled={pending} className="btn-gold rounded-xl px-6 py-2.5 text-sm font-black disabled:opacity-60">{pending ? "Creating..." : "Create admin account"}</button>
    </form>
  );
}

export function EditStaffForm({ id, name, note }: { id: string; name: string; note: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateStaffAction, undefined);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <input type="hidden" name="id" value={id} />
      <input name="name" defaultValue={name} placeholder="Name" className={input} />
      <input name="password" placeholder="New password (optional)" className={input} />
      <input name="note" defaultValue={note} placeholder="Note (e.g. shift, duty)" className={input} />
      <button disabled={pending} className="btn-violet rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-60">Save</button>
      <div className="sm:col-span-4"><Msg s={state} /></div>
    </form>
  );
}

export function OwnPasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(changeOwnPasswordAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input name="current" type="password" required placeholder="Current password" className={input} />
      <input name="next" type="password" required placeholder="New password (min 6)" className={input} />
      <Msg s={state} />
      <button disabled={pending} className="btn-gold rounded-xl px-6 py-2.5 text-sm font-black disabled:opacity-60">Change my password</button>
    </form>
  );
}
