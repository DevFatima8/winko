export function SoccerBall({ size = 54 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="block" aria-hidden="true">
      <defs>
        <radialGradient id="cg-ball-body" cx="36%" cy="27%" r="82%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="52%" stopColor="#f7fafd" />
          <stop offset="82%" stopColor="#d9e2ec" />
          <stop offset="100%" stopColor="#a8b7c6" />
        </radialGradient>
        <radialGradient id="cg-ball-gloss" cx="34%" cy="24%" r="30%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* drop shadow */}
      <ellipse cx="52" cy="88" rx="30" ry="8" fill="rgba(20,50,90,0.22)" />

      <circle cx="50" cy="50" r="46" fill="url(#cg-ball-body)" />

      {/* seam lines */}
      <g stroke="#7c8ea0" strokeWidth="1.6" fill="none" opacity="0.55">
        <path d="M50 30 L50 5" />
        <path d="M64 41 L85 19" />
        <path d="M59 57 L77 79" />
        <path d="M41 57 L23 79" />
        <path d="M36 41 L15 19" />
      </g>

      {/* pentagon panels */}
      <g fill="#1b2431">
        <polygon points="50,31 63,41 58,56 42,56 37,41" />
        <polygon points="50,7 59,15 55,26 45,26 41,15" />
        <polygon points="83,26 91,37 85,48 75,45 75,33" />
        <polygon points="76,74 84,85 73,93 63,86 66,74" />
        <polygon points="24,74 16,85 27,93 37,86 34,74" />
        <polygon points="17,26 9,37 15,48 25,45 25,33" />
      </g>

      {/* soft inner shadow + gloss */}
      <circle cx="50" cy="50" r="46" fill="url(#cg-ball-gloss)" />
      <circle cx="50" cy="50" r="45.2" fill="none" stroke="rgba(30,55,90,0.28)" strokeWidth="1.8" />
    </svg>
  );
}

/** Small ball used on the floating cash-out badges. */
export function MiniBall({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="block" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="#ffffff" stroke="#1b2431" strokeWidth="5" />
      <polygon points="50,30 63,41 58,57 42,57 37,41" fill="#1b2431" />
      <g fill="#1b2431">
        <polygon points="50,6 59,15 55,26 45,26 41,15" />
        <polygon points="83,27 91,38 85,49 75,46 75,34" />
        <polygon points="76,73 84,84 73,92 63,85 66,73" />
        <polygon points="24,73 16,84 27,92 37,85 34,73" />
        <polygon points="17,27 9,38 15,49 25,46 25,34" />
      </g>
    </svg>
  );
}
