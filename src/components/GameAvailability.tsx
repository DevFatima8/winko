"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

export function GameAvailability({ slug, backHref, children }: { slug: string; backHref: string; children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ready" | "maintenance" | "disabled" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/public/data?view=game&slug=${encodeURIComponent(slug)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to check game availability.");
        const data = await response.json() as { active?: boolean; underMaintenance?: boolean };
        if (typeof data.active !== "boolean") throw new Error("Invalid game availability response.");
        setStatus(data.underMaintenance ? "maintenance" : data.active ? "ready" : "disabled");
      }).catch(error => {
        if (!controller.signal.aborted) { console.error("[Game availability]", error); setStatus("error"); }
      });
    return () => controller.abort();
  }, [slug, attempt]);
  if (status === "ready") return children;
  return <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white" role="status">
    <h1 className="text-xl font-black">{status === "maintenance" ? "Under maintenance" : status === "disabled" ? "Game unavailable" : status === "error" ? "Unable to check game availability" : "Loading game..."}</h1>
    {status === "error" && <button type="button" className="btn-violet rounded-xl px-4 py-2" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>Retry</button>}
    <Link href={backHref} className="btn-gold rounded-xl px-4 py-2">Back to Games</Link>
  </div>;
}
