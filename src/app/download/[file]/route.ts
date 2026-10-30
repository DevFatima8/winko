import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SITE = () => "https://" + (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "winkox.vercel.app");

/** Windows / Mac / Linux desktop shortcut (.url / .webloc / .desktop) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const host = SITE();
  const url = /^https?:\/\//.test(host) ? `${host.replace(/\/$/, "")}/` : `https://${host}/`;

  // Windows shortcut
  if (file === "winkox.url") {
    const body = `[InternetShortcut]\r\nURL=${url}\r\nIconIndex=0\r\n`;
    return new NextResponse(body, { headers: { "Content-Type": "application/internet-shortcut", "Content-Disposition": 'attachment; filename="winkox.url"', "Cache-Control": "no-store" } });
  }
  // Mac / Linux
  if (file === "winkox.webloc") {
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>${url}</string></dict></plist>`;
    return new NextResponse(body, { headers: { "Content-Type": "application/x-web-location", "Content-Disposition": 'attachment; filename="winkox.webloc"' } });
  }
  // HTML launcher (Android in-app browsers / desktop fallback)
  if (file === "winkox.webmanifest" || file === "winkox-install.html") {
    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>winkox</title><link rel="manifest" href="${url}manifest.webmanifest"/><link rel="apple-touch-icon" href="${url}apple-icon.png"/>
<meta name="apple-mobile-web-app-capable" content="yes"/><meta name="mobile-web-app-capable" content="yes"/>
<meta http-equiv="refresh" content="0; url=${url}"/></head><body style="margin:0;background:#0b0716;color:#fff;font-family:Arial;text-align:center;padding-top:80px">Opening winkox…<script>setTimeout(()=>location.replace(${JSON.stringify(url)}),300)</script></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
