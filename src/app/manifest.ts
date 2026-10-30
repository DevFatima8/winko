import type { MetadataRoute } from "next";
import { cookies } from "next/headers";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Referral code travels into the installed app via start_url, so signup there joins the referrer's team.
  const ref = ((await cookies()).get("ref")?.value ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const startUrl = ref ? `/signup?ref=${ref}&source=pwa` : "/?source=pwa";
  return {
    id: "/?source=pwa",
    name: "winkox — Khelo aur Kamao",
    short_name: "winkox",
    description: "winkox — games, live casino aur earning ek hi app mein.",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    launch_handler: { client_mode: "navigate-new" },
    background_color: "#0b0716",
    theme_color: "#0b0716",
    lang: "en",
    dir: "ltr",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
