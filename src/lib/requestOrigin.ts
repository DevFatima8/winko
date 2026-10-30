import { SITE_URL } from "./siteUrl";

export function isAllowedGameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
    return origin === new URL(request.url).origin || origin === new URL(SITE_URL).origin;
  } catch {
    return false;
  }
}
