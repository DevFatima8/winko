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

test("catalog uses server credentials, form login, bearer auth and filters disabled/unsafe entries", async () => {
  configure();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/auth/login")) return response({ accessToken: token, user: { id: "merchant-123" } });
    return response([
      { id: "provider:slot:a", isEnabled: true, title: "Fortune Gem", provider: "Jili", category: " slots ", imageUrl: "https://cdn.example/game.jpg" },
      { id: "provider:slot:b", isEnabled: false, title: "Disabled", provider: "Jili", imageUrl: "https://cdn.example/off.jpg" },
      { id: "provider:slot:c", isEnabled: true, title: "Unsafe image", provider: "Jili", imageUrl: "http://cdn.example/off.jpg" },
    ]);
  };
  try {
    const games = await api.getGregmornCatalog();
    assert.equal(games.length, 1);
    assert.equal(games[0].id, "provider:slot:a");
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

test("provider unfinished-round responses are classified for safe demo fallback", async () => {
  configure();
  const input = { gameId: "provider:slot:one", playerLogin: "1234567", balance: 500, exitUrl: "https://winkox.example/player" };
  try {
    for (const message of [
      "An active session is already running",
      "previous_round_not_finished",
      "round is not completed",
    ]) {
      globalThis.fetch = async url => String(url).endsWith("/auth/login")
        ? response({ accessToken: token, user: { id: "merchant-456" } })
        : response({ status: "fail", message }, 409);
      await assert.rejects(api.openGregmornGame(input), error =>
        error instanceof api.GregmornLaunchError && error.reason === "session_in_progress");
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
  await assert.rejects(wallet.processGregmornWalletCallback(tx, callback("getBalance", { sessionid: "forged" })), /Unknown/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("invalid-amount", "1e2", 0)), /Invalid bet/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("too-large", 600, 0)), /insufficient funds/);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 500);
  await wallet.processGregmornWalletCallback(tx, write("bet-2", 20, 0));
  await assert.rejects(wallet.processGregmornWalletCallback(tx, rollback("bet-2", 19)), /not found/);
  await assert.rejects(wallet.processGregmornWalletCallback(tx, write("bet-2", 20, 0, "another-game")), /Invalid Gregmorn transaction/);
  assert.equal(tx.rows.get(`users:${user._id}`).balance, 480);
});

test("view-only demo sessions never read or change the real player wallet", async () => {
  const tx = transaction({ [`users:${user._id}`]: user });
  await wallet.registerGregmornSession(tx, session);
  await assert.rejects(wallet.registerGregmornSession(tx, { ...session, demo: true }), /identity already in use/);
  const demoSession = { ...session, sessionId: "provider-demo-session", demo: true };
  await wallet.registerGregmornSession(tx, demoSession);
  assert.deepEqual(await wallet.processGregmornWalletCallback(tx, callback("getBalance", { sessionid: demoSession.sessionId })), {
    balance: 0, currency: "PKR",
  });
  await assert.rejects(wallet.processGregmornWalletCallback(tx, callback("writeBet", {
    sessionid: demoSession.sessionId, transactionId: "demo-bet", bet: 10, win: 0, round_finished: false, info: "",
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
