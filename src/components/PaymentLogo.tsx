import type { CSSProperties } from "react";

export function PaymentLogo({ provider, height = 30, className, style }: { provider: "jazzcash" | "easypaisa"; height?: number; className?: string; style?: CSSProperties }) {
  return <img src={provider === "jazzcash" ? "/jazzcash-icon.png" : "/easypaisa-icon.jpg"} alt={provider === "jazzcash" ? "JazzCash" : "Easypaisa"} height={height} className={className} style={{ height, width: "auto", maxWidth: "100%", objectFit: "contain", ...style }} />;
}
