import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Royal Poker Casino",
  description: "5-card poker showdown against the dealer. Place your bets!",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0b0f1a] text-white antialiased">{children}</body>
    </html>
  );
}
