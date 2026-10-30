import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Honey Trap of Diao Chan — Slot Demo",
  description:
    "Honey Trap of Diao Chan betting slot demo: 5×3 reels, 30 fixed lines, free spins with Expanding Wilds, ×4 Wilds and sticky Lu Bu. Demo credits only.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0d0204",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0d0204] text-white antialiased">{children}</body>
    </html>
  );
}
