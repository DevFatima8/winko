"use client";
import { Lobby } from "@/components/lobby/Lobby";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/useDb";
import type { Row } from "@/components/lobby/LobbyClient";

export default function ClientHomePage({ params, searchParams }: { params?: Record<string, string>; searchParams?: Record<string, string> }) {
  void params;
  const { user } = useSession();
  const cat = searchParams?.cat ?? "Hot";
  const [links, setLinks] = useState<Record<string, string>>({});
  const [leaderboard, setLeaderboard] = useState<Row[]>([]);
  useEffect(() => { fetch("/api/public/data?view=lobby", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data) { setLinks(data.links ?? {}); setLeaderboard((data.leaderboard ?? []).map((row: { name: string; amount: number }, index: number) => ({ rank: index + 1, name: row.name, amount: row.amount, up: true }))); } }).catch(() => { }); }, []);

  return (
    <Lobby
      viewer={{
        loggedIn: !!user,
        isAdmin: user?.role === "admin",
        name: user?.name,
        balance: user?.balance,
        uid: user?.role === "client" ? user.displayId ?? undefined : user?.adminId ?? user?.id,
      }}
      cat={cat}
      links={links ?? {}}
      leaderboard={leaderboard}
      showHeader={false}
    />
  );
}
