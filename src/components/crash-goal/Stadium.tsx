/**
 * Daytime sky backdrop: bright blue sky, fluffy clouds and hot air balloons,
 * matching the reference art direction.
 */
export function Stadium() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* sky */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg,#1c74c8 0%,#2f92dd 26%,#63b8ec 58%,#a9dcf6 82%,#d8f0fb 100%)",
        }}
      />

      {/* sun glow */}
      <div
        className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full opacity-70 blur-2xl"
        style={{ background: "radial-gradient(circle,#fff8d8 0%,rgba(255,244,200,0) 70%)" }}
      />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="cg-cloud" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f2f9ff" />
            <stop offset="100%" stopColor="#d6e9f8" />
          </radialGradient>
          <radialGradient id="cg-cloud-soft" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#cfe6f8" stopOpacity="0.75" />
          </radialGradient>
          <linearGradient id="cg-balloon-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f6f1e6" />
            <stop offset="100%" stopColor="#d9cdb8" />
          </linearGradient>
          <linearGradient id="cg-balloon-b" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#fdece6" />
            <stop offset="100%" stopColor="#e8c3b3" />
          </linearGradient>
          <linearGradient id="cg-basket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c78b4c" />
            <stop offset="100%" stopColor="#8b5a28" />
          </linearGradient>
        </defs>

        {/* far cloud band */}
        <g opacity="0.55">
          <g transform="translate(120,120) scale(1.5)">
            <ellipse cx="0" cy="0" rx="80" ry="40" fill="url(#cg-cloud-soft)" />
            <ellipse cx="62" cy="12" rx="62" ry="32" fill="url(#cg-cloud-soft)" />
            <ellipse cx="-58" cy="14" rx="54" ry="28" fill="url(#cg-cloud-soft)" />
          </g>
          <g transform="translate(760,90) scale(1.25)">
            <ellipse cx="0" cy="0" rx="78" ry="38" fill="url(#cg-cloud-soft)" />
            <ellipse cx="70" cy="10" rx="58" ry="30" fill="url(#cg-cloud-soft)" />
            <ellipse cx="-62" cy="12" rx="52" ry="26" fill="url(#cg-cloud-soft)" />
          </g>
        </g>

        {/* hot air balloons */}
        <g transform="translate(1010,168)">
          <ellipse cx="0" cy="0" rx="44" ry="52" fill="url(#cg-balloon-a)" />
          <path d="M-44 0 Q0 -56 44 0 Z" fill="#e8534c" opacity="0.92" />
          <path d="M-22 -42 Q0 -58 22 -42 L22 34 Q0 52 -22 34 Z" fill="#e8534c" opacity="0.9" />
          <path d="M-44 0 Q0 -56 44 0" fill="none" stroke="#c9443d" strokeWidth="2" />
          <path d="M-16 42 L-11 60 M16 42 L11 60" stroke="#7a5227" strokeWidth="2.4" />
          <rect x="-14" y="58" width="28" height="18" rx="3" fill="url(#cg-basket)" />
        </g>

        <g transform="translate(1122,300) scale(0.72)">
          <ellipse cx="0" cy="0" rx="44" ry="52" fill="url(#cg-balloon-b)" />
          <path d="M-44 0 Q0 -56 44 0 Z" fill="#ef7a52" opacity="0.9" />
          <path d="M-22 -42 Q0 -58 22 -42 L22 34 Q0 52 -22 34 Z" fill="#ef7a52" opacity="0.88" />
          <path d="M-16 42 L-11 60 M16 42 L11 60" stroke="#7a5227" strokeWidth="2.6" />
          <rect x="-14" y="58" width="28" height="18" rx="3" fill="url(#cg-basket)" />
        </g>

        <g transform="translate(160,236) scale(0.62)">
          <ellipse cx="0" cy="0" rx="44" ry="52" fill="url(#cg-balloon-a)" />
          <path d="M-44 0 Q0 -56 44 0 Z" fill="#3fa2d8" opacity="0.85" />
          <path d="M-22 -42 Q0 -58 22 -42 L22 34 Q0 52 -22 34 Z" fill="#3fa2d8" opacity="0.82" />
          <rect x="-14" y="58" width="28" height="18" rx="3" fill="url(#cg-basket)" />
        </g>

        {/* mid clouds */}
        <g opacity="0.85">
          <g transform="translate(250,430) scale(1.35)">
            <ellipse cx="0" cy="0" rx="86" ry="42" fill="url(#cg-cloud)" />
            <ellipse cx="76" cy="14" rx="62" ry="32" fill="url(#cg-cloud)" />
            <ellipse cx="-70" cy="16" rx="56" ry="30" fill="url(#cg-cloud)" />
            <ellipse cx="10" cy="-22" rx="52" ry="30" fill="url(#cg-cloud)" />
          </g>
          <g transform="translate(930,468) scale(1.15)">
            <ellipse cx="0" cy="0" rx="82" ry="40" fill="url(#cg-cloud)" />
            <ellipse cx="70" cy="12" rx="58" ry="30" fill="url(#cg-cloud)" />
            <ellipse cx="-66" cy="14" rx="52" ry="28" fill="url(#cg-cloud)" />
          </g>
        </g>

        {/* near cloud sea */}
        <g>
          <g transform="translate(120,628) scale(1.9)">
            <ellipse cx="0" cy="0" rx="92" ry="46" fill="url(#cg-cloud)" />
            <ellipse cx="88" cy="12" rx="66" ry="34" fill="url(#cg-cloud)" />
            <ellipse cx="-84" cy="14" rx="60" ry="32" fill="url(#cg-cloud)" />
            <ellipse cx="18" cy="-26" rx="56" ry="32" fill="url(#cg-cloud)" />
          </g>
          <g transform="translate(600,650) scale(2.1)">
            <ellipse cx="0" cy="0" rx="94" ry="46" fill="url(#cg-cloud)" />
            <ellipse cx="92" cy="12" rx="68" ry="34" fill="url(#cg-cloud)" />
            <ellipse cx="-88" cy="14" rx="62" ry="32" fill="url(#cg-cloud)" />
            <ellipse cx="20" cy="-28" rx="58" ry="32" fill="url(#cg-cloud)" />
          </g>
          <g transform="translate(1080,640) scale(1.95)">
            <ellipse cx="0" cy="0" rx="92" ry="46" fill="url(#cg-cloud)" />
            <ellipse cx="88" cy="12" rx="66" ry="34" fill="url(#cg-cloud)" />
            <ellipse cx="-84" cy="14" rx="60" ry="32" fill="url(#cg-cloud)" />
            <ellipse cx="16" cy="-26" rx="56" ry="32" fill="url(#cg-cloud)" />
          </g>
        </g>
      </svg>
    </div>
  );
}
