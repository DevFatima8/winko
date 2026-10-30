export function Mark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Blast Off mark">
      <defs>
        <linearGradient id="bo-hull" x1="10" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#9db1cf" />
          <stop offset="1" stopColor="#3a4863" />
        </linearGradient>
        <linearGradient id="bo-flame" x1="24" y1="30" x2="24" y2="47" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd08a" />
          <stop offset="0.45" stopColor="#ff5a1f" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* orbit ring */}
      <path
        d="M6.4 32.6C2.9 22.9 8.1 12 18.4 7.4c6.6-3 14.2-2.3 19.2 1.6"
        fill="none"
        stroke="#2fe6ff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* flame */}
      <path d="M24 46c-3.2-3.6-4.8-6.9-4.8-9.8h9.6c0 2.9-1.6 6.2-4.8 9.8Z" fill="url(#bo-flame)" />
      {/* fins */}
      <path d="M18.6 30.2 12 38.4l2.1-10.1 4.5 1.9Z" fill="#ff5a1f" />
      <path d="M29.4 30.2 36 38.4l-2.1-10.1-4.5 1.9Z" fill="#ff5a1f" />
      {/* hull */}
      <path
        d="M24 2c5.2 5.6 7.9 12.2 7.9 19.3v9.9H16.1v-9.9C16.1 14.2 18.8 7.6 24 2Z"
        fill="url(#bo-hull)"
      />
      {/* window */}
      <circle cx="24" cy="17.2" r="4.1" fill="#0b1626" />
      <circle cx="24" cy="17.2" r="2.1" fill="#2fe6ff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-display text-[19px] leading-none font-bold tracking-[-0.02em] text-white">
        BLAST
      </span>
      <span className="font-display text-[19px] leading-none font-bold tracking-[0.16em] text-launch">
        OFF
      </span>
    </div>
  );
}
