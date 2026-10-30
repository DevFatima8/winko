import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function load(path, imports = {}) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", js)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const crypto = { createHash, createHmac, timingSafeEqual };
const api = load("src\\lib\\gregmorn.ts", { "node:crypto": crypto });
const identity = load("src\\lib\\gregmornIdentity.ts", { "node:crypto": crypto });
const wallet = load("src\\lib\\gregmornWallet.ts", { "node:crypto": crypto, "./gregmornIdentity": identity });
const envNames = [
  "GREGMORN_OFFICE_API_URL", "GREGMORN_CLIENT_API_URL", "GREGMORN_API_LOGIN",
  "GREGMORN_API_PASSWORD", "GREGMORN_HMAC_SECRET", "GREGMORN_CURRENCY",
  "GREGMORN_LANGUAGE", "GREGMORN_EXIT_URL", "GREGMORN_CALLBACK_URL",
];
const previousEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
process.env.GREGMORN_OFFICE_API_URL = "https://office-api-dev.helcenac.com";
process.env.GREGMORN_CLIENT_API_URL = "https://client-api-dev.helcenac.com";
const previousFetch = globalThis.fetch;
const secret = "local-test-signing-secret";
const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;

function configure() {
  process.env.GREGMORN_OFFICE_API_URL = "https://office-api-dev.helcenac.com";
  process.env.GREGMORN_CLIENT_API_URL = "https://client-api-dev.helcenac.com";
  process.env.GREGMORN_API_LOGIN = "server-test-login";
  process.env.GREGMORN_API_PASSWORD = "server-test-password";
  process.env.GREGMORN_HMAC_SECRET = secret;
  process.env.GREGMORN_CURRENCY = "PKR";
  process.env.GREGMORN_LANGUAGE = "en";
  process.env.GREGMORN_EXIT_URL = "https://winkox.example/player";
  delete process.env.GREGMORN_CALLBACK_URL;
  api.resetGregmornAuthCacheForTests();
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

test("catalog uses server credentials, form login, bearer auth and filters disabled/unsafe entries", async () => {
  configure();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/auth/login")) return response({ accessToken: token, user: { id: "merchant-123" } });
    return response([
      { id: "provider:slot:a", isEnabled: true, title: "Fortune Gem", provider: "Jili", imageUrl: "https://cdn.example/game.jpg" },
      { id: "provider:slot:b", isEnabled: false, title: "Disabled", provider: "Jili", imageUrl: "https://cdn.example/off.jpg" },
      { id: "provider:slot:c", isEnabled: true, title: "Unsafe image", provider: "Jili", imageUrl: "http://cdn.example/off.jpg" },
    ]);
  };
  try {
    const games = await api.getGregmornCatalog();
    assert.equal(games.length, 1);
    assert.equal(games[0].id, "provider:slot:a");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "https://office-api-dev.helcenac.com/auth/login");
    assert.equal(requests[0].init.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.equal(requests[0].init.body.toString(), "login=server-test-login&password=server-test-password");
    assert.equal(requests[1].url, "https://office-api-dev.helcenac.com/users/merchant-123/getUserGames/PKR");
    assert.equal(requests[1].init.headers.Authorization, `Bearer ${token}`);
    await api.getGregmornCatalog();
    assert.equal(requests.filter(request => request.url.endsWith("/auth/login")).length, 1, "token is cached");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("game launch signs the exact raw payload and validates the provider response", async () => {
  configure();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/auth/login")) return response({ accessToken: token, user: { id: "merchant-456" } });
    return response({ status: "success", content: { game: { url: "https://client-api-dev.helcenac.com/game/demo" }, gameRes: { sessionId: "session-456" } } });
  };
  try {
    const opened = await api.openGregmornGame({
      gameId: "provider:slot:one", playerLogin: "1234567", balance: 500.25,
      exitUrl: "https://winkox.example/player",
    });
    assert.equal(opened.sessionId, "session-456");
    assert.equal(requests[1].url, "https://client-api-dev.helcenac.com/games/openGame");
    assert.equal(requests[1].init.headers["X-Signature"],
      createHmac("sha256", secret).update(requests[1].init.body).digest("hex"));
    const payload = JSON.parse(requests[1].init.body);
    assert.equal(payload.demo, "0");
    assert.equal(payload.currency, "PKR");
    assert.equal(payload.user_id, "merchant-456");
    assert.equal(payload.player_login, "1234567");
    assert.equal(payload.callbackUrl, undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("launch failures classify provider rejection without exposing raw responses or secrets", async () => {
  configure();
  const input = { gameId: "provider:slot:one", playerLogin: "1234567", balance: 500, exitUrl: "https://winkox.example/player" };
  const failures = [
    [{ status: "fail", error: "unauthorized", code: 409, message: `Invalid X-Signature ${secret}` }, "signature_rejected"],
    [{ status: "fail", message: "Callback wallet unreachable" }, "wallet_callback_rejected"],
    [{ status: "fail", message: "Currency not enabled" }, "currency_rejected"],
    [{ status: "fail", message: "IP not whitelisted" }, "ip_rejected"],
    [{ status: "fail", message: "Insufficient balance" }, "balance_rejected"],
    [{ status: "fail", message: "user_id is required" }, "account_rejected"],
    [{ status: "fail", message: "Other failure" }, "provider_rejected"],
    [null, "invalid_provider_response"],
  ];
  try {
    for (const [body, reason] of failures) {
      globalThis.fetch = async url => String(url).endsWith("/auth/login")
        ? response({ accessToken: token, user: { id: "merchant-456" } })
        : response(body, 409);
      await assert.rejects(api.openGregmornGame(input), error => {
        assert.ok(error instanceof api.GregmornLaunchError);
        assert.equal(error.reason, reason);
        assert.equal(error.httpStatus, 409);
        assert.equal(error.message.includes(secret), false);
        return true;
      });
    }
    globalThis.fetch = async () => new Response("<html>Unavailable</html>", { status: 502 });
    await assert.rejects(api.openGregmornGame(input), error => error.reason === "invalid_provider_response");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("HMAC verification rejects absent, malformed and incorrect signatures", () => {
  const raw = '{"cmd":"getBalance"}';
  const signed = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(api.verifyGregmornSignature(raw, signed, secret), true);
  assert.equal(api.verifyGregmornSignature(raw, null, secret), false);
  assert.equal(api.verifyGregmornSignature(raw, "xyz", secret), false);
  assert.equal(api.verifyGregmornSignature(raw, "0".repeat(64), secret), false);
  assert.equal(api.verifyGregmornSignature(`${raw} `, signed, secret), false);
});

function transaction(initial = {}) {
  const rows = new Map(Object.entries(initial));
  const clone = value => value === undefined ? null : structuredClone(value);
  return {
    rows,
    async now() { return Date.now(); },
    async get(table, id) { return clone(rows.get(`${table}:${id}`)); },
    async put(table, id, value) { rows.set(`${table}:${id}`, structuredClone(value)); },
    async insert(table, id, value) {
      const key = `${table}:${id}`;
      if (rows.has(key)) throw new Error("duplicate key");
      rows.set(key, structuredClone(value));
    },
  };
}

const user = {
  _id: "local-user-1", role: "client", isActive: true, balance: 500,
  name: "Player", username: "player1",
};
const session = { sessionId: "provider-session", userId: user._id, playerLogin: "1234567", gameId: "provider:slot:one", currency: "PKR" };
const callback = (cmd, extra = {}) => ({
  cmd, login: "1234567", sessionid: session.sessionId, ...extra,
});
const write = (transactionId, bet, win, gameId) => callback("writeBet", {
  transactionId, bet, win, round_finished: false, info: "provider round details",
  ...(gameId === undefined ? {} : { gameId }),
});
const rollback = (transactionId, bet) => callback("rollback", {
  transactionId, bet, win: 0, round_finished: true, info: "rollback", gameId: session.gameId,
});

test("seamless callbacks map sessions and apply exact, replay-safe wallet mutations", async () => {
  const tx = transaction({ [`users:${user._id}`]: user });
  await wallet.registerGregmornSession(tx, session);
  const found = await wallet.processGregmornWalletCallback(tx, callback("getBalance"));
  assert.deepEqual(found, { balance: 500, currency: "PKR" });

  const first = await wallet.processGregmornWalletCallback(tx, write("bet-1", "25.00", "0"));
  assert.equal(first.balance, 475);
  const replay = await wallet.processGregmornWalletCallback(tx, write("bet-1", "25.00", "0"));
  assert.equal(replay.balance, 475);
  assert.equal([...tx.rows.keys()].filter(key => key.startsWith("gameresults:")).length, 1, "replays do not duplicate history");

  const payout = await wallet.processGregmornWalletCallback(tx, write("win-1", 0, 10, session.gameId));
  assert.equal(payout.balance, 485);
  const refunded = await wallet.processGregmornWalletCallback(tx, rollback("bet-1", 25));
  assert.equal(refunded.balance, 510);
  const refundReplay = await wallet.processGregmornWalletCallback(tx, rollback("bet-1", 25));
  assert.equal(refundReplay.balance, 510);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 510);
  const results = [...tx.rows.entries()].filter(([key]) => key.startsWith("gameresults:")).map(([, value]) => value);
  assert.equal(results.length, 2);
  assert.equal(results.reduce((sum, result) => sum + result.betAmount, 0), 0, "rolled-back bets do not inflate wagering reports");
  assert.equal(results.reduce((sum, result) => sum + result.winAmount, 0), 10);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("bet-1", "25.00", "0")), /already used/);
});

test("provider restrictions stop new bets but allow payouts, replays and refunds", async () => {
  const slug = identity.gregmornGameSlug(session.gameId);
  const catalogGameId = "provider-game-db-id";
  const tx = transaction({ [`users:${user._id}`]: user, [`games:${catalogGameId}`]: { _id: catalogGameId, slug, isActive: true } });
  await wallet.registerGregmornSession(tx, { ...session, catalogGameId });
  await wallet.processGregmornWalletCallback(tx, write("accepted", 20, 0));
  tx.rows.get(`games:${catalogGameId}`).isActive = false;
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("disabled", 10, 0)), /restricted/);
  assert.equal((await wallet.processGregmornWalletCallback(tx, write("accepted", 20, 0))).balance, 480);
  assert.equal((await wallet.processGregmornWalletCallback(tx, write("payout", 0, 5))).balance, 485);
  assert.equal((await wallet.processGregmornWalletCallback(tx, rollback("accepted", 20))).balance, 505);
  tx.rows.get(`games:${catalogGameId}`).isActive = true;
  tx.rows.get(`users:${user._id}`).blockedGames = [slug];
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("player-blocked", 10, 0)), /restricted/);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 505);
});

test("seamless callbacks reject forged sessions, insufficient funds, malformed amounts and mismatched rollback", async () => {
  const tx = transaction({ [`users:${user._id}`]: user });
  await wallet.registerGregmornSession(tx, session);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, callback("getBalance", { login: "other-player" })), /Unknown/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, callback("getBalance", { sessionid: "forged" })), /Unknown/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("invalid-amount", "1e2", 0)), /Invalid bet/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("too-large", 600, 0)), /insufficient funds/);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 500);
  await wallet.processGregmornWalletCallback(tx, write("bet-2", 20, 0));
  await assert.rejects(wallet.processGregmornWalletCallback(tx, rollback("bet-2", 19)), /not found/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("bet-2", 20, 0, "another-game")), /Invalid Gregmorn transaction/);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 480);
});

test("panel balances with float noise or sub-paisa remainders stay usable in every provider game", async () => {
  const noisy = { ...user, balance: 0.8599999940488487 };
  const tx = transaction({ [`users:${noisy._id}`]: noisy });
  await wallet.registerGregmornSession(tx, session);
  assert.deepEqual(await wallet.processGregmornWalletCallback(tx, callback("getBalance")), { balance: 0.86, currency: "PKR" });
  assert.equal((await wallet.processGregmornWalletCallback(tx, write("noisy-bet", "0.50", 0))).balance, 0.36);
  assert.equal(tx.rows.get(`users:${noisy._id}`).balance, 0.36);

  const remainder = transaction({ [`users:${user._id}`]: { ...user, balance: 12.345 } });
  await wallet.registerGregmornSession(remainder, session);
  assert.equal((await wallet.processGregmornWalletCallback(remainder, callback("getBalance"))).balance, 12.34);
  assert.equal((await wallet.processGregmornWalletCallback(remainder, write("rem-bet", 2, 1))).balance, 11.34);
  assert.equal(remainder.rows.get(`users:${user._id}`).balance, 11.345, "sub-paisa remainder is kept on the panel balance");
  const rejected = await wallet.processGregmornWalletCallback(remainder, write("rem-too-large", 12, 0)).catch(error => error);
  assert.match(rejected.message, /insufficient funds/);
  assert.equal(rejected.balance, 11.34, "failed callbacks report the real panel balance");
});

test.after(() => {
  globalThis.fetch = previousFetch;
  for (const name of envNames) {
    if (previousEnv[name] === undefined) delete process.env[name];
    else process.env[name] = previousEnv[name];
  }
});
