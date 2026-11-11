"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GameResultMessage } from "./GameOverOverlay";
import { LEGACY_RESULT_GAMES, type GameResultNotice } from "@/lib/gameResultNotice";

export function GameResultPopup({ game }: { game: string }) {
    const [notifications, setNotifications] = useState<{ result: GameResultNotice; sequence: number }[]>([]);
    const nextSequence = useRef(0);
    useEffect(() => {
        const seen = new Set<string>();
        const handle = (event: Event) => {
            const result = (event as CustomEvent<GameResultNotice>).detail;
            if (!result || (result.id ? result.game !== game : !LEGACY_RESULT_GAMES.includes(game))) return;
            if (!result.id && result.game.toLowerCase().replace(/[^a-z0-9]+/g, "-") !== game &&
                !(game === "aviator-x" && result.game === "Aviator")) return;
            const amount = result.poolPending ? result.poolClaim ?? 0 : result.win;
            if (!Number.isFinite(amount) || amount <= 0) return;
            if (result.id && seen.has(result.id)) return;
            if (result.id) seen.add(result.id);
            const notification = { result, sequence: ++nextSequence.current };
            setNotifications(previous => [...previous, notification]);
        };
        window.addEventListener("wx:game-result", handle);
        return () => window.removeEventListener("wx:game-result", handle);
    }, [game]);
    const dismiss = useCallback(() => setNotifications(previous => previous.slice(1)), []);
    const notification = notifications[0];
    if (!notification) return null;
    const { result, sequence } = notification;
    const amount = result.poolPending ? result.poolClaim ?? 0 : result.win;
    const detail = result.poolPending ? "Provisional win amount. Daily pool payout pending; not credited yet." : "";
    return createPortal(
        <GameResultMessage key={sequence} title="Congratulations! You win" result={detail} winAmount={amount} onDismiss={dismiss} />,
        document.body,
    );
}
