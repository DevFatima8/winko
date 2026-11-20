import { isIP } from "node:net";

function normalizeIp(raw: string) {
  const value = raw.trim();
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1];
  const ip = (bracketed ?? value.replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1")).replace(/^::ffff:/i, "");
  return isIP(ip) ? ip : null;
}

function isPrivateIp(ip: string) {
  return /^(0|10|127)\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) || /^169\.254\./.test(ip) ||
    ip === "::" || ip === "::1" || /^(fe80|f[cd][0-9a-f]{2}):/i.test(ip);
}

/** Hosting proxies must overwrite these headers; form-supplied IP addresses are never trusted. */
export function requestIp(request: Request) {
  const candidates: string[] = [];
  for (const name of ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-client-ip", "fastly-client-ip", "x-forwarded-for"]) {
    for (const part of (request.headers.get(name) ?? "").split(",")) {
      const ip = normalizeIp(part);
      if (ip) candidates.push(ip);
    }
  }
  return candidates.find(ip => !isPrivateIp(ip)) ?? candidates[0] ?? null;
}
