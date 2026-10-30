import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Private/reserved ranges that reverse proxies (Hostinger, Cloudflare, LiteSpeed, etc.) often
// insert into the forwarded-for chain — never the visitor's real address, so always skip these.
function isPrivateIp(ip: string) {
    if (/^(10|127)\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
    if (/^192\.168\./.test(ip)) return true;
    if (/^169\.254\./.test(ip)) return true;
    if (ip === "::1" || /^fe80:/i.test(ip) || /^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
    return false;
}

function normalize(raw: string) {
    return raw.trim().replace(/^::ffff:/i, "").replace(/^\[|\]$/g, "").trim();
}

export function GET(request: Request) {
    // Headers most hosting proxies/CDNs use to pass along the original client IP, checked in
    // order of trust. x-forwarded-for can contain multiple hops, so every entry is a candidate.
    const headerNames = ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-client-ip", "fastly-client-ip", "x-forwarded-for"];
    const candidates: string[] = [];
    for (const name of headerNames) {
        const value = request.headers.get(name);
        if (!value) continue;
        for (const part of value.split(",")) {
            const ip = normalize(part);
            if (ip) candidates.push(ip);
        }
    }
    const publicIp = candidates.find((ip) => !isPrivateIp(ip));
    const ip = publicIp || candidates[0] || null;
    return NextResponse.json({ ip });
}