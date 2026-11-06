import { createHmac, timingSafeEqual } from "node:crypto";

export type GregmornGame = {
  id: string;
  isEnabled: boolean;
  title: string;
  imageUrl: string;
  provider: string;
  category?: string;
};

type GregmornAuth = {
  accessToken: string;
  userId: string;
};

type GregmornLoginResponse = {
  accessToken?: unknown;
  user?: { id?: unknown };
};

type GregmornOpenGameResponse = {
  code?: unknown;
  status?: unknown;
  error?: unknown;
  message?: unknown;
  content?: { game?: { url?: unknown }; gameRes?: { sessionId?: unknown } };
};

const OPEN_GAME_ATTEMPTS = 3;

export class GregmornLaunchError extends Error {
  constructor(public readonly reason: string, public readonly httpStatus: number, public readonly providerCode?: number) {
    super(`Gregmorn launch rejected: ${reason} (HTTP ${httpStatus}).`);
  }
}

const OFFICE_API = process.env.GREGMORN_OFFICE_API_URL ?? "https://office-api-dev.helcenac.com";
const CLIENT_API = process.env.GREGMORN_CLIENT_API_URL ?? "https://client-api-dev.helcenac.com";

let authCache: { value: GregmornAuth; expiresAt: number } | null = null;
let authPending: Promise<GregmornAuth> | null = null;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Gregmorn integration is not configured: ${name} is missing.`);
  return value;
}

function validateApiUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Gregmorn API base URLs must use HTTPS and cannot include credentials.");
  }
  return url.toString().replace(/\/+$/, "");
}

function secret() {
  return required("GREGMORN_HMAC_SECRET");
}

export function signGregmornBody(rawBody: string, signingSecret = secret()) {
  return createHmac("sha256", signingSecret).update(rawBody, "utf8").digest("hex");
}

export function verifyGregmornSignature(rawBody: string, supplied: string | null, signingSecret = secret()) {
  if (!supplied || !/^[a-f\d]{64}$/i.test(supplied)) return false;
  const expected = Buffer.from(signGregmornBody(rawBody, signingSecret), "hex");
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function jwtExpiry(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof decoded.exp === "number" && Number.isFinite(decoded.exp) ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function authenticate(): Promise<GregmornAuth> {
  const login = required("GREGMORN_API_LOGIN");
  const password = required("GREGMORN_API_PASSWORD");
  const officeApi = validateApiUrl(OFFICE_API);
  const response = await fetch(`${officeApi}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ login, password }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gregmorn authentication failed (HTTP ${response.status}).`);
  const data = await response.json() as GregmornLoginResponse;
  if (typeof data.accessToken !== "string" || !data.accessToken ||
      typeof data.user?.id !== "string" || !data.user.id) {
    throw new Error("Gregmorn authentication returned an invalid account response.");
  }
  const expiresAt = jwtExpiry(data.accessToken);
  authCache = {
    value: { accessToken: data.accessToken, userId: data.user.id },
    expiresAt: expiresAt === null ? Date.now() + 5 * 60_000 : Math.max(Date.now(), expiresAt - 60_000),
  };
  return authCache.value;
}

async function getAuth(force = false) {
  if (!force && authCache && authCache.expiresAt > Date.now()) return authCache.value;
  if (!authPending) {
    authPending = authenticate().finally(() => { authPending = null; });
  }
  return authPending;
}

async function authorizedCatalogRequest(url: string, auth: GregmornAuth) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    cache: "no-store",
  });
}

export async function getGregmornCatalog(currency = process.env.GREGMORN_CURRENCY ?? "PKR"): Promise<GregmornGame[]> {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Gregmorn currency must be a three-letter ISO code.");
  const officeApi = validateApiUrl(OFFICE_API);
  let auth = await getAuth();
  const catalogUrl = `${officeApi}/users/${encodeURIComponent(auth.userId)}/getUserGames/${encodeURIComponent(currency)}`;
  let response = await authorizedCatalogRequest(catalogUrl, auth);
  if (response.status === 401) {
    authCache = null;
    auth = await getAuth(true);
    response = await authorizedCatalogRequest(`${officeApi}/users/${encodeURIComponent(auth.userId)}/getUserGames/${encodeURIComponent(currency)}`, auth);
  }
  if (!response.ok) throw new Error(`Gregmorn game catalogue request failed (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Gregmorn returned an invalid game catalogue.");
  return data.flatMap((item): GregmornGame[] => {
    if (!item || typeof item !== "object") return [];
    const game = item as Record<string, unknown>;
    if ((game.isEnabled !== undefined && typeof game.isEnabled !== "boolean") || typeof game.id !== "string" || !game.id.trim() ||
        typeof game.title !== "string" || !game.title.trim() ||
        typeof game.provider !== "string" || !game.provider.trim() ||
        typeof game.imageUrl !== "string") return [];
    let imageUrl: URL;
    try { imageUrl = new URL(game.imageUrl); } catch { return []; }
    if (imageUrl.protocol !== "https:") return [];
    return [{
      id: game.id, isEnabled: game.isEnabled !== false, title: game.title, provider: game.provider, imageUrl: imageUrl.toString(),
      ...(typeof game.category === "string" && game.category.trim() ? { category: game.category.trim() } : {}),
    }];
  });
}

export async function openGregmornGame(input: {
  gameId: string;
  playerLogin: string;
  balance: number;
  exitUrl: string;
  demo?: boolean;
}) {
  if (!input.gameId || input.gameId.length > 255) throw new Error("Invalid Gregmorn game identity.");
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(input.playerLogin)) throw new Error("Invalid Gregmorn player login.");
  if (!Number.isFinite(input.balance) || input.balance < 0) throw new Error("Invalid launch balance.");
  const exitUrl = new URL(input.exitUrl);
  if (exitUrl.protocol !== "https:" || exitUrl.username || exitUrl.password) {
    throw new Error("Gregmorn exit URL must use HTTPS and cannot include credentials.");
  }
  const currency = process.env.GREGMORN_CURRENCY ?? "PKR";
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Gregmorn currency must be a three-letter ISO code.");
  const auth = await getAuth();
  const payload = {
    currency,
    demo: input.demo ? "1" : "0",
    exitUrl: exitUrl.toString(),
    gameId: input.gameId,
    language: process.env.GREGMORN_LANGUAGE ?? "en",
    player_login: input.playerLogin,
    balance: Math.floor(Number((input.balance * 100).toFixed(4))) / 100,
    user_id: auth.userId,
    ...(process.env.GREGMORN_CALLBACK_URL ? { callbackUrl: validateCallbackUrl(process.env.GREGMORN_CALLBACK_URL) } : {}),
  };
  const rawBody = JSON.stringify(payload);
  const signature = signGregmornBody(rawBody);
  const openGameUrl = `${validateApiUrl(CLIENT_API)}/games/openGame`;
  // The provider gateway intermittently drops connections, returns non-JSON pages or
  // vendor "network error" 5xx responses. Opening a session moves no money, so retry those.
  let response: Response | null = null;
  let data: GregmornOpenGameResponse | null = null;
  let transientReason = "invalid_provider_response";
  for (let attempt = 1; attempt <= OPEN_GAME_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 700 * (attempt - 1)));
    response = null;
    data = null;
    try {
      response = await fetch(openGameUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Signature": signature },
        body: rawBody,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      const rawResponse = await response.text();
      const parsed: unknown = JSON.parse(rawResponse);
      if (parsed && typeof parsed === "object") data = parsed as GregmornOpenGameResponse;
    } catch {
      transientReason = response ? "invalid_provider_response" : "provider_unreachable";
    }
    if (data && (data.status === "success" || (response && response.status < 500))) break;
    if (data) transientReason = "provider_rejected";
    console.warn("[gregmorn launch] transient provider response", {
      attempt, status: response?.status ?? null, contentType: response?.headers.get("content-type") ?? null,
    });
  }
  if (!response || !data) throw new GregmornLaunchError(transientReason, response?.status ?? 0);
  const gameUrl = data.content?.game?.url;
  const sessionId = data.content?.gameRes?.sessionId;
  if (!response.ok || data.status !== "success" || typeof gameUrl !== "string" ||
      typeof sessionId !== "string" || !sessionId) {
    const rawDetail = `${typeof data.error === "string" ? data.error : ""} ${typeof data.message === "string" ? data.message : ""}`.toLowerCase();
    const detail = rawDetail.replace(/[_-]+/g, " ");
    const reason = /\b(?:active|unfinished|uncompleted|pending|open|ongoing)\s+(?:game\s+)?(?:session|round)\b|\b(?:session|round)\s+(?:is\s+)?(?:active|unfinished|uncompleted|pending|open|ongoing|already\s+(?:open|running|ongoing))\b|\bround\s+(?:is\s+)?not\s+(?:complete|completed|finished|closed)\b|\bprevious\s+(?:game|round|session)\b.{0,40}\b(?:active|open|unfinished|pending|finish|complete|close|not\s+(?:finished|complete|completed|closed))\b/.test(detail) ? "session_in_progress"
      : /signature|hmac/.test(rawDetail) ? "signature_rejected"
      : /网络异常|vendor open game/.test(rawDetail) ? "game_vendor_unavailable"
      : /callback|wallet/.test(rawDetail) ? "wallet_callback_rejected"
      : /currency/.test(rawDetail) ? "currency_rejected"
      : /\bip\b|whitelist|allowlist/.test(rawDetail) ? "ip_rejected"
      : /balance|fund|credit/.test(rawDetail) ? "balance_rejected"
      : /unauthori[sz]ed|user_id|merchant/.test(rawDetail) ? "account_rejected"
      : "provider_rejected";
    throw new GregmornLaunchError(reason, response.status, typeof data.code === "number" ? data.code : undefined);
  }
  let parsedUrl: URL;
  try { parsedUrl = new URL(gameUrl); } catch { throw new Error("Gregmorn returned an invalid game URL."); }
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
    throw new Error("Gregmorn returned an unsafe game URL.");
  }
  return { url: parsedUrl.toString(), sessionId, gameId: input.gameId, playerLogin: input.playerLogin, currency, demo: input.demo === true };
}

function validateCallbackUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Gregmorn callback URL must use HTTPS and cannot include credentials.");
  }
  return url.toString();
}

export function resetGregmornAuthCacheForTests() {
  authCache = null;
  authPending = null;
}
