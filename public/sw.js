const CACHE = "winkox-v5";
const CORE = ["/icon-192.png", "/icon-512.png", "/brand/logo-mark.png"];
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch((error) => console.error("[app cache]", error))); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("winkox-v") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || req.headers.has("RSC")) return;
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy))); }
      return res;
    })));
  } else if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => new Response(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>winkox - Offline</title><body style="background:#050b0f;color:white;font-family:system-ui;text-align:center;padding:15vh 20px"><h1>winkox</h1><p>Internet connection required. Reconnect, then try again.</p><button onclick="location.reload()" style="padding:12px 24px">Try again</button></body></html>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    )));
  }
});
