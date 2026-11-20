"use client";

import { useEffect, useRef, useState } from "react";

export type UserSearchFilters = { q: string; role: string; order: string };

export function AdminUserSearch({ initial, onSearch, showRole = false }: {
  initial: UserSearchFilters;
  onSearch: (filters: UserSearchFilters) => void;
  showRole?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const update = (next: UserSearchFilters) => {
    setDraft(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(next), 300);
  };
  return <form className="flex w-full flex-wrap gap-2 md:w-auto" onSubmit={event => {
    event.preventDefault();
    if (timer.current !== null) clearTimeout(timer.current);
    onSearch({ ...draft });
  }}>
    <input aria-label="Search users" value={draft.q} onChange={event => update({ ...draft, q: event.target.value })}
      placeholder="Search name / phone / username"
      className="min-w-0 flex-1 rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d946ef] md:w-64 md:flex-none" />
    {showRole && <select aria-label="User role" value={draft.role} onChange={event => update({ ...draft, role: event.target.value })} className="rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white">
      <option value="">All</option><option value="client">Clients</option><option value="agent">Agents</option>
    </select>}
    <select aria-label="Client name sort order" value={draft.order} onChange={event => update({ ...draft, order: event.target.value })} className="rounded-xl border border-[#3a2470] bg-black/30 px-3 py-2 text-sm text-white">
      <option value="asc">Ascending (A-Z)</option><option value="desc">Descending (Z-A)</option>
    </select>
    <button className="btn-violet rounded-xl px-4 py-2 text-sm font-bold">Search</button>
  </form>;
}
