import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mini Roulette",
  description:
    "Mini Roulette — fast 12-number casino roulette. Place your chips, spin the wheel and win up to 11.64x.",
};

export const viewport: Viewport = {
  themeColor: "#111214",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-casino text-white antialiased">{children}</body>
    </html>
  );
}
