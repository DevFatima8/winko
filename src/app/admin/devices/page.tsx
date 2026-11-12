"use client";
import { useEffect, useState } from "react";

type Account = {
  id: string; name: string; username: string | null; adminId: string | null; role: string; deviceCount: number;
  devices: { deviceName: string; ip: string | null; lastSeenAt: string }[];
};
const roles: Record<string, string> = { owner: "Agent", admin: "Super Admin", subadmin: "Admin", agent: "Referral player", client: "Player" };

export default function DevicesPage() {
  const [query, setQuery] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [data, setData] = useState<{ users: Account[]; total: number } | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/devices?page=${page}&q=${encodeURIComponent(search)}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Device lookup failed.");
        if (!controller.signal.aborted) setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Device lookup failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [page, search, refresh]);
  return <div className="space-y-5 text-white">
    <h1 className="text-2xl font-bold">Login devices</h1>
    <p className="text-sm text-[#b8a7e6]">Active browser/device logins for players and staff. Expired, revoked and blocked-account sessions are excluded.</p>
    <form className="flex gap-3" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query); setRefresh(value => value + 1); }}>
      <input aria-label="Search accounts" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, username, phone or admin ID" className="min-w-0 flex-1 rounded-lg bg-[#241246] p-3" />
      <button className="btn-violet rounded-lg px-4">Search / Refresh</button>
    </form>
    {loading && <p role="status">Loading devices...</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!error && data && <div className="space-y-3">{data.users.map(user => <details key={user.id} className="rounded-xl bg-[#241246] p-4">
      <summary className="cursor-pointer">{user.name} {user.adminId ?? user.username ?? ""} - {roles[user.role] ?? user.role} - <b>{user.deviceCount} active device(s)</b></summary>
      <ul className="mt-3 space-y-2 text-sm text-[#b8a7e6]">{user.devices.map((device, index) => <li key={index}>{device.deviceName} | IP: {device.ip ?? "Unknown"} | Login: {new Date(device.lastSeenAt).toLocaleString()}</li>)}</ul>
    </details>)}{!data.users.length && <p>No accounts found.</p>}</div>}
    <div className="flex items-center gap-4">
      <button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button>
      <span>Page {page}</span>
      <button disabled={!data || page * 50 >= data.total || loading} onClick={() => setPage(value => value + 1)}>Next</button>
    </div>
    <p className="text-xs text-[#b8a7e6]">One remembered browser counts once even after repeat logins. Cleared cookies, private browsing or another browser count separately. Older logins without a device identifier are shown as separate sessions.</p>
  </div>;
}
