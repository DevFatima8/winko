import type { SymbolId } from '../game/logic';

const GEMS = {
  red: ['#ffd6dc', '#ff2d55', '#7a0620'],
  blue: ['#d8f1ff', '#2b9cff', '#08308a'],
  green: ['#d9ffe0', '#2fe07a', '#04602c'],
} as const;

const LETTER_TILES: Record<'A' | 'K' | 'Q' | 'J', { a: string; b: string; edge: string }> = {
  A: { a: '#ff9b4a', b: '#a8280a', edge: '#ffd27a' },
  K: { a: '#c6a2ff', b: '#4d1d9a', edge: '#e6d2ff' },
  Q: { a: '#5ee0d2', b: '#0b6b70', edge: '#b8fff6' },
  J: { a: '#ffd35a', b: '#a86a00', edge: '#fff0a8' },
};

/** Render once at app root – shared gradients for all symbols */
export function SymbolDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {Object.entries(GEMS).map(([k, [l, m, d]]) => (
          <linearGradient key={k} id={`gem-${k}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={l} />
            <stop offset="0.45" stopColor={m} />
            <stop offset="1" stopColor={d} />
          </linearGradient>
        ))}
        {Object.entries(LETTER_TILES).map(([k, c]) => (
          <linearGradient key={k} id={`tile-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.a} />
            <stop offset="1" stopColor={c.b} />
          </linearGradient>
        ))}
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8c0" />
          <stop offset="0.45" stopColor="#ffca2e" />
          <stop offset="0.6" stopColor="#d98a00" />
          <stop offset="1" stopColor="#ffe27a" />
        </linearGradient>
        <linearGradient id="golddark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd84a" />
          <stop offset="1" stopColor="#8a4b00" />
        </linearGradient>
        <linearGradient id="letter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.5" stopColor="#ffe27a" />
          <stop offset="1" stopColor="#e0a020" />
        </linearGradient>
        <radialGradient id="eye" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.3" stopColor="#ff5a5a" />
          <stop offset="1" stopColor="#7a0010" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function Gem({ color, shape }: { color: keyof typeof GEMS; shape: 'brilliant' | 'hex' | 'emerald' }) {
  const fill = `url(#gem-${color})`;
  const stroke = GEMS[color][2];
  const facet = 'rgba(255,255,255,0.38)';
  const dark = 'rgba(0,0,0,0.24)';
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_4px_5px_rgba(0,0,0,0.6)]">
      {shape === 'brilliant' && (
        <g>
          <polygon points="24,14 76,14 97,40 50,95 3,40" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="24,14 76,14 67,40 33,40" fill={facet} />
          <polygon points="3,40 33,40 50,95" fill={dark} />
          <polygon points="97,40 67,40 50,95" fill="rgba(0,0,0,0.12)" />
          <polygon points="24,14 33,40 3,40" fill="rgba(255,255,255,0.16)" />
          <polygon points="76,14 97,40 67,40" fill="rgba(255,255,255,0.1)" />
          <polyline points="33,40 50,95 67,40" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
          <ellipse cx="38" cy="25" rx="8" ry="3" fill="#fff" opacity="0.9" transform="rotate(-18 38 25)" />
        </g>
      )}
      {shape === 'hex' && (
        <g>
          <polygon points="50,5 91,27 91,73 50,95 9,73 9,27" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="50,5 91,27 50,50 9,27" fill={facet} />
          <polygon points="9,27 50,50 50,95 9,73" fill={dark} />
          <polygon points="91,27 50,50 50,95 91,73" fill="rgba(0,0,0,0.08)" />
          <polyline points="50,50 50,95" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <ellipse cx="42" cy="20" rx="10" ry="3.5" fill="#fff" opacity="0.9" transform="rotate(-18 42 20)" />
        </g>
      )}
      {shape === 'emerald' && (
        <g>
          <polygon points="27,7 73,7 95,29 95,71 73,93 27,93 5,71 5,29" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="36,21 64,21 80,36 80,64 64,79 36,79 20,64 20,36" fill="rgba(255,255,255,0.16)" stroke={facet} strokeWidth="1.6" />
          <polygon points="42,36 58,36 66,44 66,56 58,64 42,64 34,56 34,44" fill={dark} />
          <polygon points="27,7 73,7 64,21 36,21" fill={facet} />
          <ellipse cx="34" cy="14" rx="8" ry="3" fill="#fff" opacity="0.9" />
        </g>
      )}
    </svg>
  );
}

function Letter({ id }: { id: 'A' | 'K' | 'Q' | 'J' }) {
  const t = LETTER_TILES[id];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_4px_5px_rgba(0,0,0,0.6)]">
      <rect x="8" y="8" width="84" height="84" rx="16" fill={`url(#tile-${id})`} stroke={t.edge} strokeWidth="3" />
      <rect x="14" y="14" width="72" height="72" rx="11" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <path d="M14 30 Q14 14 30 14 L70 14 Q60 34 14 40 Z" fill="rgba(255,255,255,0.22)" />
      <text
        x="50"
        y="72"
        textAnchor="middle"
        fontFamily="Georgia,'Times New Roman',serif"
        fontWeight="900"
        fontSize="66"
        fill="rgba(0,0,0,0.45)"
        transform="translate(1.5 2.5)"
      >
        {id}
      </text>
      <text
        x="50"
        y="72"
        textAnchor="middle"
        fontFamily="Georgia,'Times New Roman',serif"
        fontWeight="900"
        fontSize="66"
        fill="url(#letter)"
        stroke="#5a2a00"
        strokeWidth="1.6"
        paintOrder="stroke"
      >
        {id}
      </text>
    </svg>
  );
}

/** Golden Garuda mask – WILD */
function Wild() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,200,60,0.85)]">
      {/* feather crown */}
      <path d="M50 2 L58 16 L70 6 L70 22 L84 16 L78 32 L22 32 L16 16 L30 22 L30 6 L42 16 Z" fill="url(#gold)" stroke="#6b3200" strokeWidth="2" strokeLinejoin="round" />
      {/* ears / wings */}
      <path d="M6 40 Q2 60 16 74 L24 58 L20 40 Z" fill="url(#golddark)" stroke="#6b3200" strokeWidth="2" strokeLinejoin="round" />
      <path d="M94 40 Q98 60 84 74 L76 58 L80 40 Z" fill="url(#golddark)" stroke="#6b3200" strokeWidth="2" strokeLinejoin="round" />
      {/* face */}
      <path d="M20 30 L80 30 Q86 30 86 38 L86 60 Q86 82 50 96 Q14 82 14 60 L14 38 Q14 30 20 30 Z" fill="url(#gold)" stroke="#6b3200" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M22 38 L78 38 L78 60 Q78 76 50 88 Q22 76 22 60 Z" fill="none" stroke="#8a4b00" strokeWidth="1.5" opacity="0.7" />
      {/* brow */}
      <path d="M22 44 Q36 36 46 48 L40 50 Q32 44 24 50 Z" fill="#6b3200" />
      <path d="M78 44 Q64 36 54 48 L60 50 Q68 44 76 50 Z" fill="#6b3200" />
      {/* eyes */}
      <ellipse cx="34" cy="55" rx="8" ry="6" fill="url(#eye)" stroke="#3a1400" strokeWidth="1.6" />
      <ellipse cx="66" cy="55" rx="8" ry="6" fill="url(#eye)" stroke="#3a1400" strokeWidth="1.6" />
      <circle cx="34" cy="55" r="2" fill="#1a0000" />
      <circle cx="66" cy="55" r="2" fill="#1a0000" />
      {/* beak */}
      <path d="M42 60 L58 60 L56 74 Q50 86 44 74 Z" fill="#ffb01f" stroke="#6b3200" strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 60 L50 80" stroke="#8a4b00" strokeWidth="1.3" />
      {/* forehead gem */}
      <polygon points="50,33 56,40 50,47 44,40" fill="#3ee0ff" stroke="#08308a" strokeWidth="1.5" />
      {/* WILD ribbon */}
      <rect x="20" y="80" width="60" height="16" rx="4" fill="#6b1bb0" stroke="url(#gold)" strokeWidth="2.5" />
      <text x="50" y="92.5" textAnchor="middle" fontFamily="Impact,'Arial Black',sans-serif" fontWeight="900" fontSize="13" letterSpacing="1.5" fill="url(#gold)">
        WILD
      </text>
    </svg>
  );
}

export function SymbolIcon({ id }: { id: SymbolId }) {
  switch (id) {
    case 'red':
      return <Gem color="red" shape="brilliant" />;
    case 'blue':
      return <Gem color="blue" shape="hex" />;
    case 'green':
      return <Gem color="green" shape="emerald" />;
    case 'wild':
      return <Wild />;
    default:
      return <Letter id={id} />;
  }
}
