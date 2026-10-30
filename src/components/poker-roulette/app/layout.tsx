import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Roulette — Casino Betting Game",
  description:
    "Poker Roulette casino table game — bet on poker hand rankings, five cards get dealt, and wins pay if your hand ranks equal or better.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#052e1c] antialiased">{children}</body>
    </html>
  );
}
