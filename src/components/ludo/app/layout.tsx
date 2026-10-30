import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Lilita_One, Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

const lilita = Lilita_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-lilita",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ludo Quick",
  description: "Fast 4-player Ludo betting table. First token home wins.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} ${lilita.variable} antialiased`}>{children}</body>
    </html>
  );
}
