import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Outfit } from "next/font/google";
import "./globals.css";
import "@/components/blackjack/blackjack.css";
import "@/components/birds-beasts/birds-beasts.css";
import "@/components/blast-off/blast-off.css";
import "@/components/bollywood-casino/bollywood.css";
import "@/components/casino-war/casino-war.css";
import "@/components/crash-bonus/crash-bonus.css";
import "@/components/crash-cricket/crash-cricket.css";
import "@/components/crash-goal/crash-goal.css";
import "@/components/derby-race/derby-race.css";
import "@/components/diao-chan/app/globals.css";
import "@/components/keno/keno.css";
import "@/components/lightning-roulette/lightning-roulette.css";
import "@/components/ludo/app/globals.css";
import "@/components/mini-roulette/app/globals.css";
import "@/components/monster-hilo/app/globals.css";
import "@/components/poker-betting/app/globals.css";
import "@/components/poker-roulette/app/globals.css";
import "@/components/sic-bo/sic-bo.css";
import "@/components/speed-baccarat/speed-baccarat.css";
import "@/components/super-fruits-slot/super-fruits.css";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { ParticlesBackground } from "@/components/ParticlesBackground";
import { PromoPopups } from "@/components/PromoPopups";
import { RealtimeSync } from "@/components/RealtimeSync";
import { SplashScreen } from "@/components/SplashScreen";
import { ButtonFx } from "@/components/ButtonFx";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PwaRegister } from "@/components/PwaRegister";
import typography from "./Typography.module.css";

const outfit = Outfit({ subsets: ["latin"], display: "swap", variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "winkox — Khelo aur Kamao | winkox.shop",
  description: "winkox — Pakistan ka premium gaming & earning platform. Aviator, Chicken Dash, Plinko, Dragon Tiger aur bohot kuch. JazzCash & Easypaisa se instant deposit aur withdraw.",
  icons: { icon: "/brand/logo-mark.png", apple: "/apple-icon.png" },
  appleWebApp: { capable: true, title: "winkox", statusBarStyle: "black-translucent" },
  metadataBase: new URL("https://winkox.shop"),
  openGraph: { title: "winkox — Khelo aur Kamao", description: "Games khel kar earning karein. JazzCash & Easypaisa se instant deposit & withdraw.", url: "https://winkox.shop", siteName: "winkox", images: ["/lobby/hero.jpg"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#050b0f" }, { media: "(prefers-color-scheme: light)", color: "#050b0f" }],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const ur = locale === "ur";
  return (
    <html lang={locale} dir={ur ? "rtl" : "ltr"} className={ur ? "lang-ur" : ""} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Keep Chrome's one-use install event if it arrives before React mounts.
            __html: 'window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();window.__wxInstallPrompt=event;try{localStorage.removeItem("wx_app_installed");}catch(error){console.warn("[app install]",error);}});',
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            // The site is dark-only: drop any saved light preference.
            __html: "(function(){try{document.documentElement.classList.remove('light');localStorage.setItem('wx_theme','dark');document.cookie='theme=dark; path=/; max-age='+(60*60*24*365)+'; samesite=lax';}catch(_e){}})();",
          }}
        />
        {ur && <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap" rel="stylesheet" />}
      </head>
      <body className={`${outfit.variable} ${typography.website} wx-typography wx-bg min-h-screen text-slate-100 antialiased`}>
        <SplashScreen />
        <ButtonFx />
        <ParticlesBackground />
        <div className="relative z-[1]">
          <I18nProvider locale={locale}><RealtimeSync>{children}<PromoPopups /><PwaRegister /><InstallPrompt /></RealtimeSync></I18nProvider>
        </div>
      </body>
    </html>
  );
}
