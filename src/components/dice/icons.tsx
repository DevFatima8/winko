type P = { className?: string };

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconDice = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="4.5" {...S} />
    <circle cx="8.5" cy="8.5" r="1.35" fill="currentColor" />
    <circle cx="15.5" cy="8.5" r="1.35" fill="currentColor" />
    <circle cx="12" cy="12" r="1.35" fill="currentColor" />
    <circle cx="8.5" cy="15.5" r="1.35" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1.35" fill="currentColor" />
  </svg>
);

export const IconCoin = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <circle cx="12" cy="12" r="9" {...S} />
    <path
      d="M12 6.5v11M14.6 8.9c-.55-.95-1.6-1.5-2.6-1.5-1.6 0-2.8.95-2.8 2.1 0 2.8 5.6 1.7 5.6 4.3 0 1.3-1.2 2.2-2.8 2.2-1.1 0-2.3-.55-2.8-1.5"
      {...S}
      strokeWidth={1.7}
    />
  </svg>
);

export const IconSoundOn = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
    <path d="M15.5 8.7a4.8 4.8 0 0 1 0 6.6M18.3 6a8.6 8.6 0 0 1 0 12" {...S} />
  </svg>
);

export const IconSoundOff = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" {...S} />
  </svg>
);

export const IconTrash = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M4 7h16M10 4h4M9.5 7l.6 13h3.8l.6-13M6.5 7l.9 13.2A2 2 0 0 0 9.4 22h5.2a2 2 0 0 0 2-1.8L17.5 7" {...S} />
  </svg>
);

export const IconHelp = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <circle cx="12" cy="12" r="9" {...S} />
    <path d="M9.4 9.2a2.6 2.6 0 0 1 5.1.9c0 1.7-2.6 2.1-2.6 3.6" {...S} />
    <circle cx="11.9" cy="16.9" r="0.6" fill="currentColor" />
  </svg>
);

export const IconPlus = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M12 5v14M5 12h14" {...S} />
  </svg>
);

export const IconStop = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" />
  </svg>
);

export const IconX = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="m6 6 12 12M18 6 6 18" {...S} />
  </svg>
);
