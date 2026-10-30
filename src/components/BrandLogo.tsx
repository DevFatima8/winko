"use client";
import { useState } from "react";

/** Logo image with inline SVG fallback (in case /public/brand is missing on the host). */
export function BrandLogo({ className = "h-10 w-10", alt = "winkox" }: { className?: string; alt?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-label={alt}>
        <defs><linearGradient id="wxg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#ff8a00" /></linearGradient></defs>
        <path d="M8 46 L4 18 L20 30 L32 8 L44 30 L60 18 L56 46 Z" fill="url(#wxg)" stroke="#7a4a00" strokeWidth="2" strokeLinejoin="round" />
        <rect x="8" y="46" width="48" height="10" rx="3" fill="#ffb020" stroke="#7a4a00" strokeWidth="2" />
        <text x="32" y="44" textAnchor="middle" fontSize="20" fontWeight="900" fill="#3a1d00" fontFamily="Arial Black, sans-serif">W</text>
      </svg>
    );
  }
  return <img src="/brand/logo-mark.png" alt={alt} width={56} height={56} className={className} onError={() => setBroken(true)} />;
}
