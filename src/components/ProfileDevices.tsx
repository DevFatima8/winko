"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Device = {
    sessionId: string;
    deviceName: string;
    userAgent: string;
    ip: string | null;
    lastSeenAt: string;
};

export function ProfileDevices() {
    const router = useRouter();
    const [devices, setDevices] = useState<Device[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        fetch("/api/player/devices", { cache: "no-store" })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error ?? "Could not load devices.");
                if (active) {
                    setDevices(data.devices);
                    setCurrentSessionId(data.currentSessionId);
                }
            })
            .catch((cause: unknown) => {
                if (active) setError(cause instanceof Error ? cause.message : "Could not load devices.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    async function revoke(sessionId: string) {
        setError("");
        setRevoking(sessionId);
        try {
            const response = await fetch("/api/player/devices", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "Could not remove device.");
            if (sessionId === currentSessionId) {
                router.push("/login");
                return;
            }
            setDevices((existing) => existing.filter((device) => device.sessionId !== sessionId));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not remove device.");
        } finally {
            setRevoking(null);
        }
    }

    return (
        <div className="space-y-3">
            {loading ? <p className="text-sm text-[#b8a7e6]">Loading signed-in devices…</p> : null}
            {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
            {!loading && devices.length === 0 ? <p className="text-sm text-[#b8a7e6]">No active device sessions found.</p> : null}
            {devices.map((device) => {
                const isCurrent = device.sessionId === currentSessionId;
                return (
                    <div key={device.sessionId} className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#3a2470] bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="break-words font-bold text-white">{device.deviceName} {isCurrent ? <span className="text-emerald-300">(This device)</span> : null}</p>
                            <p className="break-all text-xs text-[#b8a7e6]">{device.userAgent || "Browser details unavailable"}</p>
                            <p className="mt-1 text-xs text-[#b8a7e6]">Last active: {new Date(device.lastSeenAt).toLocaleString()}{device.ip ? ` · IP ${device.ip}` : ""}</p>
                        </div>
                        <button
                            type="button"
                            className="btn-outline w-full shrink-0 rounded-full px-4 py-2 text-sm font-bold sm:w-auto"
                            disabled={revoking === device.sessionId}
                            onClick={() => void revoke(device.sessionId)}
                        >
                            {revoking === device.sessionId ? "Removing…" : isCurrent ? "Log out this device" : "Remove device"}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
