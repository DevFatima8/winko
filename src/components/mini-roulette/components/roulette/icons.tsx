import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const IconUndo = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconRebet = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const IconMenu = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2 4 5v6c0 5.25 3.4 10.15 8 11.5 4.6-1.35 8-6.25 8-11.5V5l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

export const IconReset = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);

export const IconSound = ({ on, ...p }: P & { on: boolean }) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    {on ? (
      <>
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </>
    ) : (
      <path d="m16 9 5 5M21 9l-5 5" />
    )}
  </svg>
);

/** Small roulette-wheel glyph used in the logo. */
export const IconWheel = (p: P) => (
  <svg width={28} height={28} viewBox="0 0 32 32" {...p}>
    <circle cx="16" cy="16" r="15" fill="#2b1d05" stroke="#d8b25a" strokeWidth="1.5" />
    {Array.from({ length: 12 }).map((_, i) => {
      const a0 = ((i * 30 - 15) * Math.PI) / 180;
      const a1 = ((i * 30 + 15) * Math.PI) / 180;
      const R = 12.5;
      const r = 6.5;
      const d = `M${16 + R * Math.sin(a0)} ${16 - R * Math.cos(a0)} A${R} ${R} 0 0 1 ${16 + R * Math.sin(a1)} ${
        16 - R * Math.cos(a1)
      } L${16 + r * Math.sin(a1)} ${16 - r * Math.cos(a1)} A${r} ${r} 0 0 0 ${16 + r * Math.sin(a0)} ${
        16 - r * Math.cos(a0)
      } Z`;
      return <path key={i} d={d} fill={i % 2 === 0 ? "#e50539" : "#1c1d21"} stroke="#d8b25a" strokeWidth="0.6" />;
    })}
    <circle cx="16" cy="16" r="3" fill="#d8b25a" />
    <circle cx="16" cy="5.5" r="1.6" fill="#fff" />
  </svg>
);
