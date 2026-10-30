type P = { className?: string };

export function IconClub({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.6c-2.3 0-4.1 1.8-4.1 4 0 1.6 1 3 2.4 3.7-1.9-.9-4.2-.2-5.2 1.6-1.1 1.9-.4 4.3 1.5 5.3 1.6.8 3.4.4 4.5-.8l.4 2.6h-2c-.6 0-1 .4-1 1s.4 1 1 1h6.4c.6 0 1-.4 1-1s-.4-1-1-1h-2l.4-2.6c1.1 1.2 2.9 1.6 4.5.8 1.9-1 2.6-3.4 1.5-5.3-1-1.8-3.3-2.5-5.2-1.6 1.4-.7 2.4-2.1 2.4-3.7 0-2.2-1.8-4-4.1-4s-4.1 1.8-4.1 4c0 .4.1.8.2 1.1-.1-.3-.2-.7-.2-1.1 0-2.2 1.8-4 4.1-4Z" />
    </svg>
  );
}

export function IconDiamond({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2 20 12 12 22 4 12Z" />
    </svg>
  );
}

export function IconSpade({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C9 6 4 8.2 4 12.4c0 2.5 1.9 4.3 4.1 4.3 1.2 0 2.2-.5 2.9-1.3l-.7 4.6H8.2c-.6 0-1 .4-1 1s.4 1 1 1h7.6c.6 0 1-.4 1-1s-.4-1-1-1h-2.1l-.7-4.6c.7.8 1.7 1.3 2.9 1.3 2.2 0 4.1-1.8 4.1-4.3C20 8.2 15 6 12 2Z" />
    </svg>
  );
}

export function IconSound({ className = "", muted = false }: P & { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M4 9.5h3L12 5.5v13L7 14.5H4z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="m16 9.5 5 5m0-5-5 5" strokeLinecap="round" />
      ) : (
        <>
          <path d="M15.8 9c.9.7 1.4 1.8 1.4 3s-.5 2.3-1.4 3" strokeLinecap="round" />
          <path d="M18.6 6.5c1.5 1.2 2.4 3.1 2.4 5.5s-.9 4.3-2.4 5.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function IconInfo({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 11v6M12 7.6h.01" strokeLinecap="round" />
    </svg>
  );
}

export function IconBolt({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M13.6 2 5 13.4h5l-1.4 8.6L19 10.2h-5.2Z" />
    </svg>
  );
}

export function IconClear({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconRepeat({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 11a8 8 0 0 1 13.7-5.6L20 7.6M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 13a8 8 0 0 1-13.7 5.6L4 16.4M4 20v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
