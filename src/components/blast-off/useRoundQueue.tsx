"use client";

import { useCallback, useRef, useState } from "react";

/** A queued instruction is not a funded bet and is consumed once at the next opening. */
export function useRoundQueue<T>() {
  const pending = useRef<T | null>(null);
  const [queued, setQueued] = useState(false);
  const [status, setStatus] = useState("");
  const enqueue = useCallback((value: T) => {
    if (pending.current !== null) return;
    pending.current = value;
    setQueued(true);
    setStatus("Queued for next round — not yet charged");
  }, []);
  const consume = useCallback(() => {
    const value = pending.current;
    pending.current = null;
    setQueued(false);
    setStatus("");
    return value;
  }, []);
  const cancel = useCallback(() => {
    if (pending.current === null) return;
    pending.current = null;
    setQueued(false);
    setStatus("Queued bet cancelled");
  }, []);
  return { enqueue, consume, cancel, queued, status, setStatus };
}

export function QueuedWager({ queued, status, cancel }: {
  queued: boolean;
  status: string;
  cancel: () => void;
}) {
  if (!status) return null;
  return <div className="px-2 py-1 text-center text-xs" role="status">
    {status} {queued && <button type="button" onClick={cancel} className="underline font-bold">Cancel queued bet</button>}
  </div>;
}
