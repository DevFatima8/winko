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
const winnings = load("src\\lib\\providerWinnings.ts");
const wallet = load("src\\lib\\gregmornWallet.ts", { "node:crypto": crypto, "./gregmornIdentity": identity, "./providerWinnings": winnings });
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

test("catalog uses server credentials, retains unavailable games and rejects unsafe entries", async () => {
  configure();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/auth/login")) return response({ accessToken: token, user: { id: "merchant-123" } });
    return response([
      { id: "provider:slot:a", isEnabled: true, title: "Fortune Gem", provider: "Jili", category: " slots ", imageUrl: "https://cdn.example/game.jpg" },
      { id: "provider:slot:b", isEnabled: false, title: "Disabled", provider: "Jili", imageUrl: "https://cdn.example/off.jpg" },
      { id: "provider:slot:c", isEnabled: true, title: "Unsafe image", provider: "Jili", imageUrl: "http://cdn.example/off.jpg" },
      { id: "provider:slot:d", title: "Status unspecified", provider: "Jili", imageUrl: "https://cdn.example/unknown.jpg" },
    ]);
  };
  try {
    const games = await api.getGregmornCatalog();
    assert.equal(games.length, 3);
    assert.equal(games[0].id, "provider:slot:a");
    assert.equal(games[1].isEnabled, false);
    assert.equal(games[2].isEnabled, true, "missing availability must not turn off games present in the API catalogue");
    assert.equal(games[0].category, "slots");
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
    assert.equal(payload.demo, "0");
    assert.equal(payload.callbackUrl, undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("USD sessions sign unchanged PKR wallet numbers and callbacks use nominal 1:1 amounts", async () => {
  configure();
  const tx = transaction({ [`users:${user._id}`]: { ...user, balance: 100.25 } });
  const route = load("src\\app\\api\\gregmorn\\wallet\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/gregmorn": api,
    "@/lib/gregmornWallet": wallet,
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn(tx) } },
  });
  const send = async payload => {
    const raw = JSON.stringify(payload);
    return route.POST(new Request("https://winkox.example/api/gregmorn/wallet", {
      method: "POST", body: raw,
      headers: { "x-signature": createHmac("sha256", secret).update(raw).digest("hex") },
    }));
  };
  const login = `usd.${session.playerLogin}`;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/auth/login")) return response({ accessToken: token, user: { id: "merchant-456" } });
    const payload = JSON.parse(init.body);
    assert.equal(payload.currency, "USD");
    assert.equal(payload.balance, 100.25, "launch must not apply FX or alter the wallet");
    assert.equal(payload.player_login, login);
    assert.equal(init.headers["X-Signature"], createHmac("sha256", secret).update(init.body).digest("hex"));
    const balance = await send({ cmd: "getBalance", login });
    assert.equal(balance.status, 200);
    assert.equal((await balance.json()).currency, "USD", "pre-session reads infer currency from the launch login");
    assert.equal(tx.rows.get(`users:${user._id}`).balance, 100.25);
    return response({ status: "success", content: { game: { url: "https://game.example/play" }, gameRes: { sessionId: "usd-session" } } });
  };
  try {
    const opened = await api.openGregmornGame({
      gameId: session.gameId, playerLogin: login, balance: 100.25,
      currency: "USD", exitUrl: "https://winkox.example/player",
    });
    assert.equal(opened.currency, "USD");
    await wallet.registerGregmornSession(tx, { ...session, sessionId: opened.sessionId, playerLogin: login, currency: opened.currency });
    const nativeBet = {
      type: "bet", action: "bet", amount: "10", currency: "USD", round_id: "usd-round",
      game_uuid: session.gameId, player_id: login, session_id: opened.sessionId, transaction_id: "usd-bet",
    };
    for (let retry = 0; retry < 2; retry++) {
      const result = await send(nativeBet);
      assert.equal(result.status, 200);
      const body = await result.json();
      assert.equal(body.balance, 90.25, "10 USD-labelled units debit exactly Rs10, including on retry");
      assert.equal(body.currency, "USD");
    }
    const before = structuredClone(tx.rows);
    for (const payload of [
      { ...nativeBet, currency: "PKR" },
      { ...write("usd-too-large", 100, 0), login, sessionid: opened.sessionId },
      { cmd: "getBalance", login, currency: "PKR" },
    ]) {
      const result = await send(payload);
      assert.equal(result.status, 400);
      assert.equal((await result.json()).currency, "USD");
      assert.deepEqual(tx.rows, before);
    }
    const payout = { ...write("usd-win", 0, "15.50"), login, sessionid: opened.sessionId, currency: "USD" };
    for (let retry = 0; retry < 2; retry++) {
      const result = await send(payout);
      assert.equal(result.status, 200);
      assert.equal((await result.json()).balance, 105.75, "15.50 USD-labelled units credit exactly Rs15.50 once");
    }
    const refund = { ...rollback("usd-bet", 10), login, sessionid: opened.sessionId, currency: "USD" };
    for (let retry = 0; retry < 2; retry++) {
      const result = await send(refund);
      assert.equal(result.status, 200);
      assert.equal((await result.json()).balance, 115.75);
    }
    const results = [...tx.rows.entries()].filter(([key]) => key.startsWith("gameresults:")).map(([, row]) => row);
    assert.equal(results.length, 2);
    assert.equal(results.reduce((sum, row) => sum + row.betAmount, 0), 0);
    assert.equal(results.reduce((sum, row) => sum + row.winAmount, 0), 15.5);
    assert.ok(results.every(row => {
      const metadata = JSON.parse(row.resultData);
      return metadata.providerCurrency === "USD" && metadata.walletCurrency === "PKR" && metadata.amountPolicy === "nominal-1:1";
    }));
    assert.equal(tx.rows.get(`users:${user._id}`).balance, 115.75);
    assert.equal((await send({ cmd: "getBalance", login: session.playerLogin })).status, 200);
    const pkrBalance = await send({ cmd: "getBalance", login: `pkr.${session.playerLogin}` });
    const body = await pkrBalance.json();
    assert.equal(body.currency, "PKR");
    assert.equal(body.balance, 115.75, "PKR and USD sessions share the same wallet");
  } finally { globalThis.fetch = previousFetch; }
});

test("view-only demo launches sign the demo mode and never use the player's wallet balance", async () => {
  configure();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/auth/login")) return response({ accessToken: token, user: { id: "merchant-456" } });
    return response({ status: "success", content: { game: { url: "https://client-api-dev.helcenac.com/game/demo" }, gameRes: { sessionId: "demo-session" } } });
  };
  try {
    const opened = await api.openGregmornGame({
      gameId: "provider:slot:one", playerLogin: "1234567", balance: 0,
      exitUrl: "https://winkox.example/player", demo: true,
    });
    const payload = JSON.parse(requests[1].init.body);
    assert.equal(payload.demo, "1");
    assert.equal(payload.balance, 0);
    assert.equal(opened.demo, true);
    assert.equal(requests[1].init.headers["X-Signature"],
      createHmac("sha256", secret).update(requests[1].init.body).digest("hex"));
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
    [{ status: "fail", message: "demo not supported" }, "demo_not_supported"],
    [{ status: "fail", message: '{"error":"DEMO_NOT_SUPPORTED","message":"Live casino games have no demo."}' }, "demo_not_supported"],
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

test("provider unfinished-round responses are classified for real-session waiting without rapid 5xx retries", async () => {
  configure();
  const input = { gameId: "provider:slot:one", playerLogin: "1234567", balance: 500, exitUrl: "https://winkox.example/player" };
  try {
    for (const [message, status] of [
      ["An active session is already running", 409],
      ["previous_round_not_finished", 409],
      ["round is not completed", 409],
      ["SESSION_IN_PROGRESS", 500],
      ["Round is already running", 503],
      ["previous round has not finished", 409],
    ]) {
      let opens = 0;
      globalThis.fetch = async url => String(url).endsWith("/auth/login")
        ? response({ accessToken: token, user: { id: "merchant-456" } })
        : (opens++, response({ status: "fail", message }, status));
      await assert.rejects(api.openGregmornGame(input), error =>
        error instanceof api.GregmornLaunchError && error.reason === "session_in_progress");
      assert.equal(opens, 1, "unfinished sessions wait on the client instead of rapid upstream retries");
    }
    globalThis.fetch = async url => String(url).endsWith("/auth/login")
      ? response({ accessToken: token, user: { id: "merchant-456" } })
      : response({ status: "fail", message: "Currency not enabled" }, 409);
    await assert.rejects(api.openGregmornGame(input), error => error.reason === "currency_rejected");
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

function transaction(initial = {}, displayIds = { "1234567": "local-user-1" }) {
  const rows = new Map(Object.entries(initial));
  const clone = value => value === undefined ? null : structuredClone(value);
  return {
    rows,
    async playerUserId(displayId) { return displayIds[displayId] ?? null; },
    async now() { return Date.now(); },
    async get(table, id) { return clone(rows.get(`${table}:${id}`)); },
    async put(table, id, value) { rows.set(`${table}:${id}`, structuredClone(value)); },
    async insert(table, id, value) {
      const key = `${table}:${id}`;
      if (rows.has(key)) throw new Error("duplicate key");
      rows.set(key, structuredClone(value));
    },
    async findWhere(table, filters, limit = 1000) {
      return [...rows.entries()].filter(([key, row]) => key.startsWith(`${table}:`) &&
        Object.entries(filters).every(([field, value]) => row[field] === value))
        .map(([, row]) => clone(row)).slice(0, limit);
    },
    async page(table, filters, after = "") {
      return [...rows.entries()].filter(([key, row]) => key.startsWith(`${table}:`) && row._id > after &&
        Object.entries(filters).every(([field, value]) => row[field] === value))
        .map(([, row]) => clone(row)).sort((a, b) => a._id.localeCompare(b._id)).slice(0, 500);
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
  const holds = [...tx.rows.entries()].filter(([key]) => key.startsWith("winholds:")).map(([, value]) => value);
  assert.equal(holds.length, 0);
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
  assert.equal((await wallet.processGregmornWalletCallback(tx, callback("getBalance", { sessionid: "not-created-yet" }))).balance, 500);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("invalid-amount", "1e2", 0)), /Invalid bet/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("too-large", 600, 0)), /insufficient funds/);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 500);
  await wallet.processGregmornWalletCallback(tx, write("bet-2", 20, 0));
  await assert.rejects(wallet.processGregmornWalletCallback(tx, rollback("bet-2", 19)), /not found/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("bet-2", 20, 0, "another-game")), /Invalid Gregmorn transaction/);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 480);
});

test("signed transaction failures identify invalid fields without exposing payloads or reporting a false zero balance", async () => {
  configure();
  const tx = transaction({ [`users:${user._id}`]: user });
  await wallet.registerGregmornSession(tx, session);
  const route = load("src\\app\\api\\gregmorn\\wallet\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/gregmorn": api,
    "@/lib/gregmornWallet": wallet,
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn(tx) } },
  });
  const invalidCases = [
    [{ transactionId: undefined }, ["transactionId"]],
    [{ transactionId: 123 }, ["transactionId"]],
    [{ transactionId: {} }, ["transactionId"]],
    [{ transactionId: "" }, ["transactionId"]],
    [{ transactionId: "x".repeat(256) }, ["transactionId"]],
    [{ info: undefined }, ["info"]],
    [{ info: { privateProviderDetail: "must-not-be-logged" } }, ["info"]],
    [{ round_finished: undefined }, ["round_finished"]],
    [{ round_finished: "false" }, ["round_finished"]],
    [{ gameId: "private-mismatched-game" }, ["gameId"]],
    [{ info: null, round_finished: 0, gameId: null }, ["info", "round_finished", "gameId"]],
  ];
  const before = structuredClone(tx.rows);
  for (const [fields, expectedFields] of invalidCases) {
    const raw = JSON.stringify({ ...write("private-transaction", 10, 0), ...fields });
    const result = await route.POST(new Request("https://winkox.example/api/gregmorn/wallet", {
      method: "POST", body: raw,
      headers: { "x-signature": createHmac("sha256", secret).update(raw).digest("hex") },
    }));
    assert.equal(result.status, 400);
    const body = await result.json();
    assert.equal(body.status, "fail");
    assert.equal(body.balance, 500);
    assert.equal(body.currency, "PKR");
    assert.match(body.error, /^Invalid Gregmorn transaction\. Invalid fields:/);
    for (const field of expectedFields) assert.ok(body.error.includes(`${field} (`));
    for (const privateValue of ["private-transaction", "private-mismatched-game", "must-not-be-logged", session.sessionId]) {
      assert.equal(body.error.includes(privateValue), false);
    }
    assert.deepEqual(tx.rows, before, "invalid callbacks must not debit, credit or create history");
  }
});

test("signed Evolution bet payload debits once and preserves legacy payouts and refunds", async () => {
  configure();
  const evolution = {
    type: "bet", action: "bet", amount: "10", currency: "PKR",
    round_id: "18e634272eaa5787c5554647-ugggu7ab4hsaczxr",
    game_uuid: "377ee5b90ccb4c30942e27714b2dfda6",
    player_id: "1677347", session_id: "c18eee36-f2bc-4e94-b534-c165383e0909",
    transaction_id: "db2486d1b1494a6db9020f39cb542f52",
  };
  const registered = {
    ...session, sessionId: evolution.session_id, playerLogin: evolution.player_id,
  };
  const tx = transaction({ [`users:${user._id}`]: user });
  await wallet.registerGregmornSession(tx, registered);
  const route = load("src\\app\\api\\gregmorn\\wallet\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/gregmorn": api,
    "@/lib/gregmornWallet": wallet,
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn(tx) } },
  });
  const send = async (payload, signed = true) => {
    const raw = JSON.stringify(payload);
    return route.POST(new Request("https://winkox.example/api/gregmorn/wallet", {
      method: "POST", body: raw,
      headers: signed ? { "x-signature": createHmac("sha256", secret).update(raw).digest("hex") } : {},
    }));
  };
  const before = structuredClone(tx.rows);
  const invalidCases = [
    { action: "win" }, { type: "win" }, { type: undefined }, { amount: undefined },
    { amount: {} }, { amount: "-10" }, { amount: "1e2" }, { amount: "0.001" },
    { amount: "501" }, { transaction_id: undefined }, { transaction_id: "" },
    { transaction_id: "x".repeat(256) }, { transaction_id: 123 },
    { round_id: undefined }, { round_id: "" }, { round_id: {} },
    { currency: undefined }, { currency: "USD" }, { currency: "" },
    { game_uuid: undefined }, { game_uuid: "x".repeat(256) }, { game_uuid: "" }, { game_uuid: "   " },
    { player_id: "another-player" }, { player_id: 1677347 },
    { session_id: undefined }, { session_id: "unknown-session" },
  ];
  assert.equal((await send(evolution, false)).status, 400);
  for (const fields of invalidCases) {
    const result = await send({ ...evolution, ...fields });
    assert.equal(result.status, 400, JSON.stringify(fields));
    assert.equal((await result.json()).status, "fail");
    assert.deepEqual(tx.rows, before, "invalid native callbacks must not mutate wallets or history");
  }
  for (let retry = 0; retry < 2; retry++) {
    const result = await send(evolution);
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.balance, 490);
    assert.equal(body.currency, "PKR");
    assert.equal(body.login, evolution.player_id);
    assert.equal(body.status, "success");
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
  const afterBet = structuredClone(tx.rows);
  for (const fields of [{ amount: "11" }, { round_id: "different-round" }, { game_uuid: "another-vendor-uuid" }]) {
    assert.equal((await send({ ...evolution, ...fields })).status, 400);
    assert.deepEqual(tx.rows, afterBet, "changed retries must not debit again");
  }
  assert.equal([...tx.rows.keys()].filter(key => key.startsWith("gameresults:")).length, 1);
  const legacy = { login: registered.playerLogin, sessionid: registered.sessionId, gameId: registered.gameId };
  const payout = await send({ ...write("evolution-payout", 0, 15), ...legacy });
  assert.equal(payout.status, 200);
  assert.equal((await payout.json()).balance, 505);
  const refund = { ...rollback(evolution.transaction_id, 10), ...legacy };
  for (let retry = 0; retry < 2; retry++) {
    const result = await send(refund);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).balance, 515);
  }
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 515);
  assert.equal((await send(evolution)).status, 400, "refunded bets must not be replayed");

  const demo = transaction({ [`users:${user._id}`]: user });
  await wallet.registerGregmornSession(demo, { ...registered, demo: true });
  await assert.rejects(wallet.processGregmornWalletCallback(demo, wallet.parseGregmornCallback(evolution)), /view-only demo/);
  assert.equal(demo.rows.get(`users:${user._id}`).balance, 500);
});

test("reported Evolution catalogue/UUID mismatch settles against its session with safe debug diagnostics", async () => {
  configure();
  const payload = {
    type: "bet", action: "bet", amount: "20", currency: "PKR",
    round_id: "18e6a8cd9c54425ad6d6c9b2-ugggu7ab4hsaczxr",
    game_uuid: "0552304625ea4eada3dcf103072c5b15", player_id: "1677347",
    session_id: "364284d0-4a51-4038-8984-733003fce9d5",
    transaction_id: "9bbb5bd224574164ac667f5e8365072d",
  };
  const catalogGameId = "evolution-catalogue-db-id";
  const registered = {
    ...session, sessionId: payload.session_id, playerLogin: payload.player_id,
    gameId: "integration:evolution:football-studio", catalogGameId,
  };
  const tx = transaction({
    [`users:${user._id}`]: { ...user, balance: 206892137.7 },
    [`games:${catalogGameId}`]: { _id: catalogGameId, isActive: true },
  });
  await wallet.registerGregmornSession(tx, registered);
  const route = load("src\\app\\api\\gregmorn\\wallet\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/gregmorn": api,
    "@/lib/gregmornWallet": wallet,
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn(tx) } },
  });
  const send = async (data, signed = true) => {
    const raw = JSON.stringify(data);
    return route.POST(new Request("https://winkox.example/api/gregmorn/wallet", {
      method: "POST", body: raw,
      headers: signed ? { "x-signature": createHmac("sha256", secret).update(raw).digest("hex") } : {},
    }));
  };
  const previousDebug = process.env.GREGMORN_WALLET_DEBUG;
  const previousInfo = console.info;
  const logs = [];
  console.info = (...args) => logs.push(args);
  process.env.GREGMORN_WALLET_DEBUG = "1";
  try {
    assert.equal((await send(payload, false)).status, 400);
    assert.equal(logs.length, 0, "unsigned requests must not produce session diagnostics");
    const normalized = wallet.parseGregmornCallback(payload);
    assert.equal(normalized.gameId, undefined);
    assert.equal(normalized.vendorGameUuid, payload.game_uuid);
    for (let retry = 0; retry < 2; retry++) {
      const result = await send(payload);
      assert.equal(result.status, 200);
      const body = await result.json();
      assert.equal(body.balance, 206892117.7);
      assert.equal(body.status, "success");
      assert.equal(body.error, "");
    }
    const results = [...tx.rows.entries()].filter(([key]) => key.startsWith("gameresults:")).map(([, row]) => row);
    assert.equal(results.length, 1);
    assert.equal(results[0].gameId, catalogGameId);
    assert.equal(results[0].betAmount, 20);
    assert.equal(JSON.parse(results[0].resultData).vendorGameUuid, payload.game_uuid);
    tx.rows.get(`games:${catalogGameId}`).isActive = false;
    assert.equal((await send({ ...payload, transaction_id: "restricted-new-bet" })).status, 400);
    assert.equal((await send(payload)).status, 200, "restrictions still permit exact retries");
    tx.rows.get(`games:${catalogGameId}`).isActive = true;
    tx.rows.get(`users:${user._id}`).blockedGames = [identity.gregmornGameSlug(registered.gameId)];
    assert.equal((await send({ ...payload, transaction_id: "player-restricted-bet" })).status, 400);
    const forgedLegacy = {
      ...write("legacy-mismatch", 20, 0, payload.game_uuid),
      login: registered.playerLogin, sessionid: registered.sessionId,
      vendorGameUuid: payload.game_uuid,
    };
    const failure = await send(forgedLegacy);
    assert.equal(failure.status, 400);
    assert.match((await failure.json()).error, /gameId/);
    assert.equal(wallet.parseGregmornCallback(forgedLegacy).vendorGameUuid, undefined);
    assert.equal(tx.rows.get(`users:${user._id}`).balance, 206892117.7);
    assert.ok(logs.length > 0);
    assert.equal(logs[0][1].format, "vendor-bet");
    assert.equal(logs[0][1].catalogGameMatches, null);
    assert.equal(logs[0][1].loginMatches, true);
    assert.equal(logs[0][1].currencyMatches, true);
    const text = JSON.stringify(logs);
    for (const value of [payload.player_id, payload.session_id, payload.transaction_id, payload.game_uuid,
      registered.gameId, payload.round_id, secret, "206892137.7"]) {
      assert.equal(text.includes(value), false, "debug logs must not disclose raw identities or financial payloads");
    }
    process.env.GREGMORN_WALLET_DEBUG = "0";
    const count = logs.length;
    assert.equal((await send(payload)).status, 200);
    assert.equal(logs.length, count, "debug logging must be opt-in");
  } finally {
    console.info = previousInfo;
    if (previousDebug === undefined) delete process.env.GREGMORN_WALLET_DEBUG;
    else process.env.GREGMORN_WALLET_DEBUG = previousDebug;
  }
});

test("pre-launch getBalance resolves an active player before session registration", async () => {
  const player = { ...user, balance: 12.345, pendingReferralCommission: 7 };
  const tx = transaction({ [`users:${user._id}`]: player }, { [session.playerLogin]: user._id });
  assert.deepEqual(await wallet.processGregmornWalletCallback(tx, callback("getBalance")), { balance: 12.34, currency: "PKR" });
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 12.345);
  assert.equal(tx.rows.get(`users:${user._id}`).pendingReferralCommission, 7);
  assert.equal(tx.rows.size, 1, "balance lookup must not invent a provider session");
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("before-registration", 10, 0)), /Unknown.*session/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, rollback("before-registration", 10)), /Unknown.*session/);
  await wallet.registerGregmornSession(tx, session);
  assert.equal((await wallet.processGregmornWalletCallback(tx, write("after-registration", 10, 0))).balance, 2.34);
});

test("pre-launch balance rejects missing mappings, inactive, deleted and non-player accounts", async () => {
  for (const accounts of [
    [],
    [{ ...user, isActive: false }],
    [{ ...user, role: "admin" }],
    [{ ...user, balance: -1 }],
  ]) {
    const tx = transaction(Object.fromEntries(accounts.map(account => [`users:${account._id}`, account])), { [session.playerLogin]: user._id });
    await assert.rejects(wallet.processGregmornWalletCallback(tx, callback("getBalance")), /unavailable|Unknown/i);
  }
  const tx = transaction({ [`users:${user._id}`]: { ...user, displayId: session.playerLogin } }, {});
  await assert.rejects(wallet.processGregmornWalletCallback(tx, callback("getBalance")), /Unknown/);
});

test("balance reads use login independently of supplied sessions and demo balances stay zero", async () => {
  const tx = transaction({ [`users:${user._id}`]: user }, { [session.playerLogin]: user._id });
  assert.deepEqual(await wallet.processGregmornWalletCallback(tx, callback("getBalance", {
    login: `demo.${session.playerLogin}`, sessionid: "not-registered-demo",
  })), { balance: 0, currency: "PKR" });
  assert.equal(tx.rows.size, 1);
  await wallet.registerGregmornSession(tx, session);
  assert.deepEqual(await wallet.processGregmornWalletCallback(tx, callback("getBalance", {
    login: `demo.${session.playerLogin}`,
  })), { balance: 0, currency: "PKR" });
  const previousGet = tx.get;
  tx.get = async (table, ...args) => {
    assert.notEqual(table, "gregmornsessions", "balance reads must never query provider sessions");
    return previousGet(table, ...args);
  };
  for (const sessionid of ["", session.sessionId, "not-created-yet", "x".repeat(300)]) {
    assert.deepEqual(await wallet.processGregmornWalletCallback(tx, callback("getBalance", { sessionid })),
      { balance: 500, currency: "PKR" });
  }
  const noMapping = transaction({ [`users:${user._id}`]: user }, {});
  await wallet.registerGregmornSession(noMapping, session);
  await assert.rejects(wallet.processGregmornWalletCallback(noMapping, callback("getBalance")), /Unknown.*player/);
});

test("wallet rejection logs report safe reasons without identity, payload or signatures", async () => {
  configure();
  const logs = [];
  const previousWarn = console.warn;
  console.warn = (...args) => { logs.push(args); };
  const tx = transaction({ [`users:${user._id}`]: user }, { [session.playerLogin]: user._id });
  const route = load("src\\app\\api\\gregmorn\\wallet\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/gregmorn": api,
    "@/lib/gregmornWallet": wallet,
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn(tx) } },
  });
  const sentSignatures = [];
  async function send(body, signed = true) {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const signature = signed ? createHmac("sha256", secret).update(raw).digest("hex") : "not-a-valid-signature";
    sentSignatures.push(signature);
    return route.POST(new Request("https://winkox.example/api/gregmorn/wallet", {
      method: "POST", body: raw, headers: { "x-signature": signature },
    }));
  }
  try {
    await send(callback("getBalance"), false);
    await send("{malformed-json-sensitive-data");
    await send({ cmd: "sensitive-unknown-command", login: session.playerLogin });
    await send(write("private-transaction-id", 10, 0));
    await wallet.registerGregmornSession(tx, session);
    await send(write("private-transaction-id", "1e2", 0));
    await send(write("private-transaction-id", 600, 0));
    const safeLogs = logs.filter(([label]) => label === "[gregmorn wallet callback] Rejected");
    assert.deepEqual(safeLogs.map(([, detail]) => detail), [
      { reason: "invalid signature", httpStatus: 400 },
      { reason: "invalid json", httpStatus: 400 },
      { reason: "invalid callback request", httpStatus: 400 },
      { reason: "Unknown Gregmorn player session.", httpStatus: 400 },
      { reason: "Invalid bet or win amount.", httpStatus: 400 },
      { reason: "insufficient funds", httpStatus: 400 },
    ]);
    const text = JSON.stringify(logs);
    for (const sensitive of [session.playerLogin, session.sessionId, "private-transaction-id",
      "malformed-json-sensitive-data", "sensitive-unknown-command", secret, ...sentSignatures]) {
      assert.equal(text.includes(sensitive), false, "logs must not expose callback or signing data");
    }
    assert.equal(tx.rows.get(`users:${user._id}`).balance, 500, "diagnostics cannot change wallet behavior");
    const beforeSuccess = logs.length;
    const success = await send(callback("getBalance"));
    assert.equal(success.status, 200);
    assert.equal(logs.length, beforeSuccess, "successful wallet calls do not generate rejection logs");
    const failure = await send(callback("getBalance"), false);
    assert.equal(failure.headers.get("cache-control"), "no-store");
  } finally { console.warn = previousWarn; }
});

test("signed HTTP getBalance succeeds inside openGame, while unsigned calls and early bets fail", async () => {
  configure();
  const tx = transaction({ [`users:${user._id}`]: user }, { [session.playerLogin]: user._id });
  const route = load("src\\app\\api\\gregmorn\\wallet\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/gregmorn": api,
    "@/lib/gregmornWallet": wallet,
    "@/lib/multiplayer-store": { mysqlMultiplayerStore: { transact: async (_room, fn) => fn(tx) } },
  });
  const httpCallback = async (body, signed = true) => {
    const raw = JSON.stringify(body);
    return route.POST(new Request("https://winkox.example/api/gregmorn/wallet", {
      method: "POST", body: raw,
      headers: signed ? { "x-signature": createHmac("sha256", secret).update(raw).digest("hex") } : {},
    }));
  };
  const unsigned = await httpCallback(callback("getBalance"), false);
  assert.equal(unsigned.status, 400);
  assert.equal((await unsigned.json()).error, "invalid signature");
  for (const sessionid of [undefined, null, ""]) {
    const balance = await httpCallback({ cmd: "getBalance", login: session.playerLogin, sessionid });
    assert.equal(balance.status, 200);
    const data = await balance.json();
    assert.equal(data.balance, 500);
    assert.equal(data.status, "success");
    const bet = await httpCallback({ ...write("missing-session", 10, 0), sessionid });
    assert.equal(bet.status, 400);
    const refund = await httpCallback({ ...rollback("missing-session", 10), sessionid });
    assert.equal(refund.status, 400);
    const unsignedBalance = await httpCallback({ cmd: "getBalance", login: session.playerLogin, sessionid }, false);
    assert.equal(unsignedBalance.status, 400);
  }
  const malformedSession = await httpCallback({ cmd: "getBalance", login: session.playerLogin, sessionid: 123 });
  assert.equal(malformedSession.status, 400);
  const demoBalance = await httpCallback({ cmd: "getBalance", login: `demo.${session.playerLogin}` });
  assert.equal((await demoBalance.json()).balance, 0);
  globalThis.fetch = async url => {
    if (String(url).endsWith("/auth/login")) return response({ accessToken: token, user: { id: "merchant-456" } });
    const balanceResponse = await httpCallback(callback("getBalance"));
    assert.equal(balanceResponse.status, 200);
    const data = await balanceResponse.json();
    assert.equal(data.status, "success");
    assert.equal(data.balance, 500);
    assert.equal(data.error, "");
    const earlyBet = await httpCallback(write("too-early", 10, 0));
    assert.equal(earlyBet.status, 400);
    return response({ status: "success", content: { game: { url: "https://game.example/play" }, gameRes: { sessionId: session.sessionId } } });
  };
  try {
    const opened = await api.openGregmornGame({
      gameId: session.gameId, playerLogin: session.playerLogin, balance: 500, exitUrl: "https://winkox.example/player",
    });
    await wallet.registerGregmornSession(tx, { ...session, sessionId: opened.sessionId });
    assert.equal((await httpCallback(write("registered-bet", 10, 0))).status, 200);
    assert.equal(tx.rows.get(`users:${user._id}`).balance, 490);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("view-only demo sessions never read or change the real player wallet", async () => {
  const tx = transaction({ [`users:${user._id}`]: user });
  await wallet.registerGregmornSession(tx, session);
  await assert.rejects(wallet.registerGregmornSession(tx, { ...session, demo: true }), /identity already in use/);
  const demoSession = { ...session, sessionId: "provider-demo-session", playerLogin: `demo.${session.playerLogin}`, demo: true };
  await wallet.registerGregmornSession(tx, demoSession);
  assert.deepEqual(await wallet.processGregmornWalletCallback(tx, callback("getBalance", { login: demoSession.playerLogin, sessionid: demoSession.sessionId })), {
    balance: 0, currency: "PKR",
  });
  await assert.rejects(wallet.processGregmornWalletCallback(tx, callback("writeBet", {
    login: demoSession.playerLogin, sessionid: demoSession.sessionId, transactionId: "demo-bet", bet: 10, win: 0, round_finished: false, info: "",
  })), /view-only demo/);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 500);
  assert.equal([...tx.rows.keys()].some(key => key.startsWith("gregmorntransactions:")), false);
  assert.equal([...tx.rows.keys()].some(key => key.startsWith("gameresults:")), false);
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

test("provider payouts credit immediately with no holds, midnight delay or replay credit", async () => {
 const tx=transaction({[`users:${user._id}`]:{...user,balance:1000,pendingReferralCommission:30}});
 await wallet.registerGregmornSession(tx,session);
 const body=write("instant-win",100,150);
 assert.equal((await wallet.processGregmornWalletCallback(tx,body)).balance,1050);
 assert.equal((await wallet.processGregmornWalletCallback(tx,body)).balance,1050);
 assert.equal((await wallet.processGregmornWalletCallback(tx,callback("getBalance"))).balance,1050);
 assert.equal([...tx.rows.keys()].filter(k=>k.startsWith("winholds:")).length,0);
 assert.equal(tx.rows.get(`users:${user._id}`).pendingReferralCommission,30);
});

test("old locked and eligible payouts release once on wallet callbacks, leaving claimed holds and referral untouched", async () => {
 const tx=transaction({[`users:${user._id}`]:{...user,balance:25,pendingReferralCommission:7.5}});
 await wallet.registerGregmornSession(tx,session);
 for(const [id,amount,claimed,unlockAt] of [["locked",15,false,new Date(Date.now()+86400000)],["eligible",20,false,new Date(0)],["paid",50,true,new Date(0)]]) {
 await tx.insert("winholds",id,{_id:id,userId:user._id,provider:"gregmorn",amount,claimed,unlockAt});
 }
 assert.equal((await wallet.processGregmornWalletCallback(tx,callback("getBalance"))).balance,60);
 assert.equal((await wallet.processGregmornWalletCallback(tx,callback("getBalance"))).balance,60);
 assert.equal(tx.rows.get("winholds:locked").claimed,true);
 assert.equal(tx.rows.get("winholds:eligible").claimed,true);
 assert.equal(tx.rows.get(`users:${user._id}`).pendingReferralCommission,7.5);
 assert.equal((await wallet.processGregmornWalletCallback(tx,write("new-win",20,15))).balance,55);
 assert.equal((await wallet.processGregmornWalletCallback(tx,write("new-win",20,15))).balance,55);
});

test("legacy holds remain immediately eligible and claims include more than 500 winning records", async () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const tx = transaction({ [`users:${user._id}`]: user });
  tx.now = async () => now;
  for (let i = 0; i < 1201; i++) {
    const id = `hold-${String(i).padStart(5, "0")}`;
    await tx.insert("winholds", id, { _id: id, userId: user._id, amount: 0.01, provider: "gregmorn", unlockAt: new Date(now - 1), claimed: false });
  }
  await tx.insert("winholds", "legacy", { _id: "legacy", userId: user._id, amount: 2, unlockAt: new Date(now + 999999), claimed: false });
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id), { claimed: 14.01 });
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 514.01);
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id), { claimed: 0 });
});

test("claims reject invalid wallets without consuming winnings, and transaction failures roll back all claim writes", async () => {
  const hold = { _id: "eligible", userId: user._id, amount: 150, provider: "gregmorn", unlockAt: new Date(0), claimed: false };
  const rows = { [`users:${user._id}`]: { ...user, balance: -5 }, "winholds:eligible": hold };
  const invalid = transaction(rows);
  await assert.rejects(winnings.claimWinningsTransaction(invalid, user._id), /Wallet balance/);
  assert.equal(invalid.rows.get("winholds:eligible").claimed, false);
  const committed = transaction({ ...rows, [`users:${user._id}`]: user });
  const staged = transaction(Object.fromEntries(committed.rows));
  const put = staged.put;
  staged.put = async (table, id, value) => {
    if (table === "users") throw new Error("Injected wallet write failure");
    await put(table, id, value);
  };
  await assert.rejects(winnings.claimWinningsTransaction(staged, user._id), /Injected wallet/);
  assert.equal(committed.rows.get("winholds:eligible").claimed, false, "failed transaction is discarded");
  assert.equal(committed.rows.get(`users:${user._id}`).balance, user.balance);
  assert.deepEqual(await winnings.claimWinningsTransaction(committed, user._id), { claimed: 150 });
  assert.equal(committed.rows.get(`users:${user._id}`).balance, 650);
});

test("legacy pending referral claims remain eligible without resetting lifetime commission", async () => {
  const tx = transaction({ [`users:${user._id}`]: { ...user, balance: 900, commissionEarned: 120, pendingReferralCommission: 30 } });
  const now = Date.parse("2026-11-01T12:00:00Z");
  tx.now = async () => now;
  await tx.insert("winholds", "today", { _id: "today", userId: user._id, amount: 150, provider: "gregmorn", unlockAt: winnings.nextPakistanMidnight(now), claimed: false });
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 30 });
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 930);
  assert.equal(tx.rows.get(`users:${user._id}`).commissionEarned, 120);
  assert.equal(tx.rows.get(`users:${user._id}`).pendingReferralCommission, 0);
  assert.equal(tx.rows.get("winholds:today").claimed, false);
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 0 });
  await tx.put("users", user._id, { ...tx.rows.get(`users:${user._id}`), pendingReferralCommission: 15 });
  tx.now = async () => now + 86400000;
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id), { claimed: 150 });
  assert.equal(tx.rows.get(`users:${user._id}`).pendingReferralCommission, 15, "winning claims leave referral commission untouched");
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 15 });
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 1095);
});

test("new referral commission unlocks exactly at next PKT midnight; later claims keep today's commission locked", async () => {
  let now = Date.parse("2026-11-05T18:59:59.999Z");
  const firstUnlock = winnings.nextPakistanMidnight(now).getTime();
  assert.equal(firstUnlock, Date.parse("2026-11-05T19:00:00Z"));
  const tx = transaction({ [`users:${user._id}`]: {
    ...user, balance: 100, pendingReferralCommission: 15,
    pendingReferralCommissionByUnlock: { [firstUnlock]: 15 }, commissionEarned: 15,
  } });
  tx.now = async () => now;
  assert.equal(winnings.summarizeReferralCommission(tx.rows.get(`users:${user._id}`), now).locked, 15);
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 0 });
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 100);
  now++;
  assert.equal(winnings.summarizeReferralCommission(tx.rows.get(`users:${user._id}`), now).claimable, 15);
  const secondUnlock = winnings.nextPakistanMidnight(now).getTime();
  await tx.put("users", user._id, {
    ...tx.rows.get(`users:${user._id}`), pendingReferralCommission: 22.5,
    pendingReferralCommissionByUnlock: { [firstUnlock]: 15, [secondUnlock]: 7.5 }, commissionEarned: 22.5,
  });
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 15 });
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 115);
  assert.equal(tx.rows.get(`users:${user._id}`).pendingReferralCommission, 7.5);
  assert.deepEqual(tx.rows.get(`users:${user._id}`).pendingReferralCommissionByUnlock, { [secondUnlock]: 7.5 });
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 0 });
  now = Date.parse("2026-11-12T08:30:00Z");
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 7.5 });
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 122.5);
  assert.equal(tx.rows.get(`users:${user._id}`).commissionEarned, 22.5);
  assert.deepEqual(tx.rows.get(`users:${user._id}`).pendingReferralCommissionByUnlock, {});
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 0 });
});

test("legacy pending plus new locked commission claims only the legacy portion and malformed buckets fail closed", async () => {
  const future = Date.now() + 86400000;
  const tx = transaction({ [`users:${user._id}`]: {
    ...user, pendingReferralCommission: 35, pendingReferralCommissionByUnlock: { [future]: 15 },
  } });
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 20 });
  assert.equal(tx.rows.get(`users:${user._id}`).pendingReferralCommission, 15);
  for (const buckets of [{ invalid: 15 }, { [future]: -1 }, { [future]: 40 }, { [future]: "15" }]) {
    assert.throws(() => winnings.summarizeReferralCommission({ pendingReferralCommission: 15, pendingReferralCommissionByUnlock: buckets }, Date.now()), /referral commission|Referral commission/);
  }
});

test("old credited commission is not claimed again and malformed pending commission cannot credit a wallet", async () => {
  const old = transaction({ [`users:${user._id}`]: { ...user, commissionEarned: 10000 } });
  assert.deepEqual(await winnings.claimWinningsTransaction(old, user._id, "referral"), { claimed: 0 });
  assert.equal(old.rows.get(`users:${user._id}`).balance, user.balance);
  for (const amount of [-1, NaN, Infinity, "30"]) {
    const tx = transaction({ [`users:${user._id}`]: { ...user, pendingReferralCommission: amount } });
    await assert.rejects(winnings.claimWinningsTransaction(tx, user._id, "referral"), /Invalid pending referral commission/);
    assert.equal(tx.rows.get(`users:${user._id}`).balance, user.balance);
  }
});

test("referral Claim never consumes eligible winnings and rejects replay without changing the wallet", async () => {
  const tx = transaction({ [`users:${user._id}`]: { ...user, balance: 100, pendingReferralCommission: 7.5 } });
  await tx.insert("winholds", "eligible", { _id: "eligible", userId: user._id, amount: 15, provider: "gregmorn", unlockAt: new Date(0), claimed: false });
  tx.page = async () => { throw new Error("Referral claims must not read winning holds"); };
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 7.5 });
  assert.equal(tx.rows.get("winholds:eligible").claimed, false);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 107.5);
  assert.deepEqual(await winnings.claimWinningsTransaction(tx, user._id, "referral"), { claimed: 0 });
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 107.5);
});

test.after(() => {
  globalThis.fetch = previousFetch;
  for (const name of envNames) {
    if (previousEnv[name] === undefined) delete process.env[name];
    else process.env[name] = previousEnv[name];
  }
});
