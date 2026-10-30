import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20, props: P = {}) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, ...props });

/* ---------- brand icons (official-style paths) ---------- */
export const WhatsAppIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
  </svg>
);
export const TelegramIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);
export const FacebookIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);
export const InstagramIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 1 0 0-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
  </svg>
);
export const YouTubeIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);
export const GooglePlayIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)} fill="none">
    <path d="M3.6 2.3 13.4 12 3.6 21.7c-.4-.2-.6-.6-.6-1.1V3.4c0-.5.2-.9.6-1.1Z" fill="#00D7FE" />
    <path d="m16.8 8.6-3.4 3.4-9.8-9.7c.1-.1.3-.1.4-.1.3 0 .5.1.8.2l12 6.2Z" fill="#00F076" />
    <path d="m16.8 15.4-12 6.2c-.3.1-.5.2-.8.2-.1 0-.3 0-.4-.1l9.8-9.7 3.4 3.4Z" fill="#F63448" />
    <path d="M20.4 13.5 16.8 15.4 13.4 12l3.4-3.4 3.6 1.9c.5.3.8.8.8 1.5s-.3 1.2-.8 1.5Z" fill="#FFC900" />
  </svg>
);
export const AppleIcon = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

/* ---------- UI icons (Lucide-style strokes) ---------- */
const stroke = (size = 20, props: P = {}) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...props });
export const HeadsetIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>);
export const ChatIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
export const BellIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>);
export const GlobeIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>);
export const SunIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>);
export const MoonIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" /></svg>);
export const HomeIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>);
export const GiftIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>);
export const UsersIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
export const WalletIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>);
export const UserIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
export const GamepadIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01" /><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" /></svg>);
export const ZapIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>);
export const BanknoteIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></svg>);
export const ShieldIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>);
export const FlameIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>);
export const BookIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>);
export const HistoryIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>);
export const CrownIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" /></svg>);
export const MenuIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M3 5h18M13 10h8M13 14h8M3 19h18M9 9l-4 3 4 3z" /></svg>);
export const XIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const ArrowUpIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="m5 12 7-7 7 7M12 19V5" /></svg>);
export const ArrowLeftIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="m12 19-7-7 7-7M19 12H5" /></svg>);
export const SendIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>);
export const PlayIcon = ({ size, ...p }: P) => (<svg {...base(size, p)}><path d="M8 5v14l11-7z" /></svg>);
export const DownloadIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>);
export const RefreshIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" /></svg>);
export const TrophyIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>);
export const CheckIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M20 6 9 17l-5-5" /></svg>);
export const MailIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>);
export const MegaphoneIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>);
export const StarIcon = ({ size, ...p }: P) => (<svg {...base(size, p)}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>);
export const HeartHandIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" /><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" /><path d="m2 15 6 6" /><path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z" /></svg>);
export const TargetIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>);
export const PercentIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>);
export const CalendarIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);
export const LifeBuoyIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" /></svg>);
export const PackageIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></svg>);
export const MessageSquareIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></svg>);
export const CircleHelpIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>);
export const SpadeIcon = ({ size, ...p }: P) => (<svg {...base(size, p)}><path d="M12 2C9 7 4 9.5 4 14a4 4 0 0 0 6.9 2.75C10.5 18.5 9.5 20 8 21h8c-1.5-1-2.5-2.5-2.9-4.25A4 4 0 0 0 20 14c0-4.5-5-7-8-12z" /></svg>);
export const DiceIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" /></svg>);
export const FishIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z" /><path d="M18 12v.5M16 17.93a9.77 9.77 0 0 1 0-11.86M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33" /></svg>);
export const TicketIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>);
export const MedalIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" /><path d="M11 12 5.12 2.2M13 12l5.88-9.8M8 7h8" /><circle cx="12" cy="17" r="5" /><path d="M12 18v-2h-.5" /></svg>);
export const CricketIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><path d="m5.5 19-2.5-2.5 9.5-9.5 2.5 2.5z" /><path d="m13.5 6.5 2-2a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2l-2 2" /><circle cx="6" cy="6" r="2" /></svg>);
export const SlotIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><rect x="3" y="5" width="16" height="14" rx="2" /><path d="M7 9v6M11 9v6M15 9v6M22 8v3" /><circle cx="22" cy="6" r="1.5" /></svg>);

export const AndroidIcon = ({ size = 20, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M17.6 9.5 19.4 6.4a.55.55 0 1 0-.95-.55L16.6 9.05A8.9 8.9 0 0 0 12 8a8.9 8.9 0 0 0-4.6 1.05L5.55 5.85a.55.55 0 1 0-.95.55L6.4 9.5A8.7 8.7 0 0 0 3 16.5h18a8.7 8.7 0 0 0-3.4-7zm-9.1 4.4a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7zm7 0a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7z" /></svg>
);
export const LaptopIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M2 20h20" /></svg>);
export const TabletIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M11 18h2" /></svg>);

export const ShareIcon = ({ size, ...p }: P) => (<svg {...stroke(size, p)}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>);
