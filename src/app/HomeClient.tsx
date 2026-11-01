"use client";
import { Header, Lobby, CONTAINER } from "@/components/lobby/Lobby";
import { useEffect, useState } from "react";
import { PageLoadingSkeleton, useSession } from "@/lib/useDb";
import type { Row } from "@/components/lobby/LobbyClient";
import { useProviderCatalog } from "@/lib/useProviderCatalog";

export default function HomeClient({ cat }: { cat: string }) {
  const catalog = useProviderCatalog();
  const { user, loading: sessionLoading, error: sessionError } = useSession();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [leaderboard, setLeaderboard] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let controller: AbortController | undefined;
    let alive = true;
    const load = async () => {
      if (window.location.pathname !== "/") return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setError("");
      try {
        const response = await fetch("/api/public/data?view=lobby", { cache: "no-store", signal: request.signal });
        if (!response.ok) throw new Error("Lobby load nahi ho saki. Dobara koshish karein.");
        const data = await response.json();
        if (!alive || request.signal.aborted) return;
        setLinks(data.links ?? {});
        setLeaderboard((data.leaderboard ?? []).map((row: { name: string; amount: number }, index: number) => ({ rank: index + 1, name: row.name, amount: row.amount, up: true })));
      } catch (e) {
        if (alive && !request.signal.aborted) setError(e instanceof Error ? e.message : "Lobby load nahi ho saki.");
      } finally {
        if (alive && !request.signal.aborted) setLoading(false);
      }
    };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void load(); };
    const back = () => { void load(); };
    void load();
    window.addEventListener("pageshow", restored);
    window.addEventListener("popstate", back);
    return () => { alive = false; controller?.abort(); window.removeEventListener("pageshow", restored); window.removeEventListener("popstate", back); };
  }, [retry]);
  const viewer = { loggedIn: !!user, isAdmin: user?.role === "admin", name: user?.name, balance: user?.balance, uid: user?.role === "client" ? user.displayId ?? undefined : user?.adminId ?? user?.id };
  if (loading || sessionLoading || error) return (
    <div className="wx-lobby wx-bg min-h-[100dvh] text-white">
      <Header viewer={viewer} showAnnouncement={false} />
      <main className={`${CONTAINER} space-y-3 px-2 py-3`}>
        {(error || sessionError) && <div role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-300">{error || sessionError}{error && <button type="button" onClick={() => { setLoading(true); setRetry((n) => n + 1); }} className="ml-3 text-[#ffc933] underline">Retry</button>}</div>}
        {!error && <PageLoadingSkeleton message="Lobby loading..." />}
      </main>
    </div>
  );
  return <Lobby viewer={viewer} cat={cat} links={links} leaderboard={leaderboard} catalog={catalog} />;
}
