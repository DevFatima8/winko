import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monster HiLo | MonsterBet Originals",
  description: "Play Monster HiLo, a free-to-play higher or lower card game with virtual credits.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
