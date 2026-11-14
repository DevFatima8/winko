import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function compile(file) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
function registry(file) {
  const exports = {};
  new Function("exports", compile(file))(exports);
  return exports;
}
const games = [
  ...registry("src\\lib\\cardGameRules.ts").CARD_GAMES,
  ...registry("src\\lib\\rouletteGameRules.ts").ROULETTE_GAMES,
  "aviator",
];
const code = compile("src\\components\\DailyPoolNotice.tsx");
const opportunityRules = registry("src\\lib\\winOpportunityRules.ts");
const slotRules = registry("src\\lib\\slotGameRules.ts");
const opportunityCode = compile("src\\components\\WinOpportunityNotice.tsx");
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? text(node.props?.children) : String(node);
}
function scene(game, response = { status: 200, data: { enabled: false, balance: 1000, entries: [] } }, unsupported = false) {
  let cursor = 0;
  const states = [], effects = [], cleanups = [], requests = [], balances = [];
  const timers = new Map(), listeners = new Map();
  const jsx = (type, props) => ({ type, props });
  const require = name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return {
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = value; }];
      },
      useEffect(fn) { if (!cleanups.length) effects.push(fn); },
    };
    if (name === "@/lib/walletSync") return { broadcastBalanceUpdate: value => balances.push(value) };
    if (name === "@/lib/dailyPoolBrowserGames") return { isUnsupportedBrowserPoolGame: () => unsupported };
    if (name === "@/lib/winOpportunityRules") return opportunityRules;
    if (name === "@/lib/slotGameRules") return slotRules;
    if (name === "@/lib/dailyPoolRules") return { DAILY_POOL_SETTLEMENT_RULES: ["Deferred daily pool rules: 35% allocated; 65% retained."] };
    if (name === "@/lib/dailyPoolConsent") return { acceptDailyPool: () => {} };
    if (name === "./WinOpportunityNotice") {
      const notice = {};
      new Function("require", "exports", opportunityCode)(require, notice);
      return notice;
    }
    throw new Error(`Unexpected entry import ${name}; entry must not grant wagering consent.`);
  };
  const exports = {};
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (response.error) throw response.error;
    return { status: response.status, ok: response.status < 400, json: async () => response.data };
  };
  const window = {
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
  };
  new Function("require", "exports", "fetch", "window", "setTimeout", "clearTimeout", code)(
    require, exports, fetch, window,
    fn => { const id = Symbol(); timers.set(id, fn); return id; },
    id => timers.delete(id),
  );
  const resolveNode = node => {
    if (Array.isArray(node)) return node.map(resolveNode);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return resolveNode(node.type(node.props));
    return { ...node, props: { ...node.props, children: resolveNode(node.props?.children) } };
  };
  const render = (currentGame = game) => {
    cursor = 0;
    return resolveNode(exports.DailyPoolNotice({ game: currentGame, children: "GAME VISIBLE" }));
  };
  return {
    render, requests, balances, listeners, timers,
    async mount() {
      const initial = render();
      for (const effect of effects.splice(0)) cleanups.push(effect());
      for (let index = 0; index < 8; index++) await Promise.resolve();
      return initial;
    },
    unmount() { for (const cleanup of cleanups) cleanup?.(); },
  };
}

for (const game of games) {
  test(`${game}: games open immediately while status loads in the background`, async () => {
    const s = scene(game);
    const initial = await s.mount();
    const loaded = s.render();
    assert.match(text(initial), /GAME VISIBLE/);
    assert.doesNotMatch(text(initial), /Loading game status/);
    assert.ok(!nodes(initial).some(node => node.type === "details" || node.type === "button"));
    assert.match(text(loaded), /GAME VISIBLE/);
    assert.doesNotMatch(text(loaded), /winning opportunities|30\/100|zero-return losses|Read before playing/);
    assert.ok(!nodes(loaded).some(node => node.type === "details" || node.type === "button"));
    assert.ok(!nodes(loaded).some(node => node.props?.role === "dialog"));
    assert.equal(s.requests.length, 1);
    assert.equal(s.requests[0].options.method, undefined);
    assert.deepEqual(s.balances, [1000]);
    s.unmount();
    assert.equal(s.listeners.size, 0);
    assert.equal(s.timers.size, 0);
  });
}

test("switching games renders immediately without accepting stale settlement configuration", async () => {
  const s = scene("baccarat");
  await s.mount();
  assert.match(text(s.render()), /GAME VISIBLE/);
  const changed = s.render("dice");
  assert.match(text(changed), /GAME VISIBLE/);
  assert.ok(!nodes(changed).some(node => node.type === "button"));
  s.unmount();
});

test("status failures remain visible without replacing the game", async () => {
  const s = scene("baccarat", { error: new Error("Status connection interrupted.") });
  await s.mount();
  assert.match(text(s.render()), /GAME VISIBLE/);
  assert.match(text(s.render()), /Status connection interrupted/);
  assert.ok(nodes(s.render()).some(node => node.props?.role === "alert"));
  assert.deepEqual(s.balances, []);
  s.unmount();
});

test("wallet errors retain their dismiss control without restoring the rules popup", async () => {
  const s = scene("auto-roulette");
  await s.mount();
  s.listeners.get("wx:wallet-error")({ detail: { error: "Wager confirmation pending." } });
  let tree = s.render();
  assert.match(text(tree), /Wager confirmation pending/);
  assert.match(text(tree), /GAME VISIBLE/);
  nodes(tree).find(node => node.type === "button" && text(node) === "Dismiss").props.onClick();
  tree = s.render();
  assert.doesNotMatch(text(tree), /Wager confirmation pending/);
  s.unmount();
});

test("unsupported wagering remains explicitly blocked without displaying pool rules", async () => {
  const s = scene("evo-casino", { status: 200, data: { enabled: true } }, true);
  await s.mount();
  assert.match(text(s.render()), /No stake has been accepted/);
  assert.doesNotMatch(text(s.render()), /GAME VISIBLE|pool|\bAccept\b|Continue/i);
  s.unmount();
});
