import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const jsx = (type, props) => ({ type, props });
const tick = () => new Promise(resolve => setImmediate(resolve));

function hooks() {
  const slots = [], effects = [], refs = [];
  let cursor = 0, effectCursor = 0, refCursor = 0;
  return {
    react: {
      useId: () => "title",
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
      },
      useRef: initial => {
        const index = refCursor++;
        refs[index] ??= { current: initial };
        return refs[index];
      },
      useEffect: (callback, deps) => {
        const index = effectCursor++;
        const previous = effects[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
          previous?.cleanup?.();
          effects[index] = { deps, callback };
        }
      },
    },
    render: callback => {
      cursor = effectCursor = refCursor = 0;
      const result = callback();
      for (const effect of effects) {
        if (effect.callback) {
          effect.cleanup = effect.callback();
          effect.callback = undefined;
        }
      }
      return result;
    },
    unmount: () => effects.forEach(effect => effect.cleanup?.()),
  };
}

function browser(pathname = "/games-all") {
  const names = ["window", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame", "fetch"];
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const entries = new Map(), frames = new Map(), listeners = new Map(), scrolls = [];
  let id = 0;
  globalThis.window = {
    location: { pathname, search: "?cat=Hot", hash: "#games", assign: url => { globalThis.window.assigned = url; } },
    scrollY: 1450,
    scrollTo: options => scrolls.push(options.top),
    addEventListener: (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
  };
  globalThis.sessionStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  return {
    entries, scrolls,
    frame: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback());
    },
    event: (name, event) => listeners.get(name)?.forEach(callback => callback(event)),
    restore: () => names.forEach((name, index) => {
      if (previous[index]) Object.defineProperty(globalThis, name, previous[index]);
      else delete globalThis[name];
    }),
  };
}

function navigation(react) {
  return load("src\\lib\\gameNavigation.ts", {
    react, "next/navigation": { usePathname: () => window.location.pathname },
  });
}

function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => find(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate),
    ...find(tree.props?.hot, predicate), ...find(tree.props?.rest, predicate)];
}

const state = { category: "Hot", search: "Aviator", provider: "SPRIBE", limit: 120, sliderScrollLeft: 640 };

function waitingPanel() {
  const env = browser(), runtime = hooks(), timers = new Map();
  const previousSetTimeout = globalThis.setTimeout, previousClearTimeout = globalThis.clearTimeout;
  let id = 0;
  globalThis.setTimeout = (callback, delay) => { timers.set(++id, { callback, delay }); return id; };
  globalThis.clearTimeout = key => timers.delete(key);
  const game = { id: "real-game", title: "Live Game", provider: "Live", isEnabled: true, imageUrl: "https://cdn.example/game.jpg" };
  const component = load("src\\components\\lobby\\GregmornGames.tsx", {
    react: runtime.react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "@/lib/auth": { getCurrentUser: async () => ({ dbRole: "client" }) },
    "@/lib/providerCategories": load("src\\lib\\providerCategories.ts"),
    "@/lib/providerOrder": load("src\\lib\\providerOrder.ts"),
    "@/lib/gameNavigation": { readProviderGameReturn: () => null, rememberGameReturn: () => {}, useGameReturnScroll: () => {} },
    "@/lib/useProviderCatalog": { useProviderCatalog: () => ({}) },
    "./GameThumbnail": { GameThumbnail: "thumbnail" },
    "./GameGridSkeleton": { GameGridSkeleton: "skeleton" },
    "./HotSlider": { HotSlider: "slider" },
  }).GregmornGames;
  const render = (category = "All") => runtime.render(() => component({ category, catalog: { games: [game], loading: false, error: "" } }));
  return {
    env, runtime, render, timers,
    start: () => find(render(), node => node.type === "button" && typeof node.props.children !== "string")[0].props.onClick(),
    advance: async () => {
      assert.equal(timers.size, 1);
      const [key, timer] = [...timers][0];
      assert.equal(timer.delay, 10_000, "polling must be spaced by ten seconds");
      timers.delete(key);
      timer.callback();
      await tick();
    },
    restore: () => {
      runtime.unmount();
      assert.equal(timers.size, 0, "unmount must clear the pending retry");
      globalThis.setTimeout = previousSetTimeout;
      globalThis.clearTimeout = previousClearTimeout;
      env.restore();
    },
  };
}

test("unfinished sessions wait indefinitely at ten-second intervals, prevent duplicate clicks and then open real play", async () => {
  const panel = waitingPanel(), requests = [];
  let ready = false;
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return ready ? Response.json({ url: "https://provider.example/real" })
      : Response.json({ code: "session_in_progress" }, { status: 409 });
  };
  try {
    panel.render(); await tick();
    panel.start(); panel.start(); await tick();
    assert.equal(requests.length, 1, "same-render double clicks cannot launch duplicate requests");
    const tree = panel.render();
    assert.ok(find(tree, node => node.type === "p" && String(node.props.children).includes("Waiting for the next available session")).length);
    assert.equal(window.assigned, undefined);
    for (let i = 0; i < 70; i++) await panel.advance();
    assert.equal(requests.length, 71, "waiting has no arbitrary timeout even after more than ten minutes");
    assert.ok(requests.every(body => body.gameId === "real-game" && body.demo === undefined));
    ready = true;
    await panel.advance();
    assert.equal(window.assigned, "https://provider.example/real");
    assert.equal(panel.timers.size, 0);
  } finally { panel.restore(); }
});

test("Cancel clears session polling and allows another game launch", async () => {
  const panel = waitingPanel();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ code: "session_in_progress" }, { status: 409 });
  };
  try {
    panel.render(); await tick();
    panel.start(); await tick();
    find(panel.render(), node => node.type === "button" && node.props.children === "Cancel")[0].props.onClick();
    await tick();
    assert.equal(panel.timers.size, 0);
    assert.equal(window.assigned, undefined);
    assert.equal(find(panel.render(), node => node.type === "button")[0].props.disabled, false);
    panel.start(); await tick();
    assert.equal(calls, 2);
    assert.equal(panel.timers.size, 1);
  } finally { panel.restore(); }
});

test("cancelling an in-flight launch ignores late URLs and cannot overwrite a newer wait", async () => {
  const panel = waitingPanel();
  let release, oldSignal, calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    if (calls === 1) {
      oldSignal = options.signal;
      return new Promise(resolve => { release = resolve; });
    }
    return Response.json({ code: "session_in_progress" }, { status: 409 });
  };
  try {
    panel.render(); await tick();
    panel.start(); await tick();
    find(panel.render(), node => node.type === "button" && node.props.children === "Cancel")[0].props.onClick();
    assert.equal(oldSignal.aborted, true);
    panel.start(); await tick();
    release(Response.json({ url: "https://provider.example/stale" }));
    await tick();
    assert.equal(window.assigned, undefined);
    assert.equal(panel.timers.size, 1);
    assert.equal(find(panel.render(), node => node.type === "button" && typeof node.props.children !== "string")[0].props.disabled, true);
  } finally { panel.restore(); }
});

test("page departure, category changes and unmount stop waiting without stale navigation", async () => {
  for (const action of ["pagehide", "category", "unmount"]) {
    const panel = waitingPanel();
    globalThis.fetch = async () => Response.json({ code: "session_in_progress" }, { status: 409 });
    try {
      panel.render(); await tick();
      panel.start(); await tick();
      if (action === "pagehide") {
        panel.env.event("pagehide", {});
        panel.env.event("pageshow", { persisted: true });
      } else if (action === "category") {
        panel.render("Live");
      } else panel.runtime.unmount();
      await tick();
      assert.equal(panel.timers.size, 0, action);
      assert.equal(window.assigned, undefined);
    } finally { panel.restore(); }
  }
});

test("vendor errors, demo rejection, account errors and invalid responses stop rather than waiting", async () => {
  for (const [status, body] of [
    [503, { code: "game_vendor_unavailable", error: "Vendor unavailable" }],
    [503, { code: "demo_not_supported", error: "Demo unsupported" }],
    [401, { error: "Account inactive" }],
    [403, { error: "Restricted" }],
    [409, { error: "Account not ready" }],
    [503, { code: "session_in_progress", error: "Wrong response status" }],
  ]) {
    const panel = waitingPanel();
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1
      ? Response.json({ code: "session_in_progress" }, { status: 409 })
      : Response.json(body, { status });
    try {
      panel.render(); await tick();
      panel.start(); await tick();
      await panel.advance();
      assert.equal(calls, 2);
      assert.equal(panel.timers.size, 0);
      assert.equal(window.assigned, undefined);
      assert.ok(find(panel.render(), node => node.type === "p" && node.props.children === body.error).length);
    } finally { panel.restore(); }
  }
});

test("network and malformed JSON failures surface an error instead of silently retrying", async () => {
  for (const failure of ["network", "json"]) {
    const panel = waitingPanel();
    globalThis.fetch = async () => {
      if (failure === "network") throw new Error("Network unavailable");
      return new Response("<html>Gateway error</html>", { status: 502 });
    };
    try {
      panel.render(); await tick();
      panel.start(); await tick();
      assert.equal(panel.timers.size, 0);
      assert.equal(window.assigned, undefined);
      assert.ok(find(panel.render(), node => node.type === "p" && node.props.role === "status").length);
    } finally { panel.restore(); }
  }
});

test("return storage preserves the view only for the originating page and scroll waits for rendered games", () => {
  const env = browser(), runtime = hooks(), nav = navigation(runtime.react);
  try {
    nav.rememberGameReturn(state);
    assert.deepEqual(nav.readProviderGameReturn(), state);
    runtime.render(() => nav.useGameReturnScroll(false));
    env.frame(); env.frame();
    assert.deepEqual(env.scrolls, []);
    assert.equal(nav.hasGameReturn(), true);
    runtime.render(() => nav.useGameReturnScroll(true));
    env.frame(); env.frame();
    assert.deepEqual(env.scrolls, [1450]);
    assert.equal(nav.hasGameReturn(), false);
    nav.rememberGameReturn(state);
    window.location.pathname = "/";
    assert.equal(nav.readProviderGameReturn(), null);
  } finally { runtime.unmount(); env.restore(); }
});

test("provider game departure and full page remount restore loaded count and position without removed filters", async () => {
  const env = browser("/");
  const departing = hooks(), returning = hooks();
  const nav = navigation({ useEffect: () => {} });
  const games = Array.from({ length: 125 }, (_, index) => ({
    id: `game-${index}`, title: `Aviator ${index}`, provider: "SPRIBE", isHot: true,
    imageUrl: "https://cdn.example/game.jpg",
  }));
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ url: "https://provider.example/play" });
  };
  function panel(runtime) {
    return load("src\\components\\lobby\\GregmornGames.tsx", {
      "@/lib/providerCategories": load("src\\lib\\providerCategories.ts"),
      "@/lib/providerOrder": load("src\\lib\\providerOrder.ts", {}),
      react: runtime.react,
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/navigation": { useRouter: () => ({ push: () => {} }) },
      "next/image": { default: "image" },
      "@/lib/auth": { getCurrentUser: async () => ({ dbRole: "client" }) },
      "@/components/Icons": { FlameIcon: "flame" },
      "@/lib/gameNavigation": { ...nav, useGameReturnScroll: () => {} },
      "@/lib/useProviderCatalog": { useProviderCatalog: () => ({}) },
      "./GameThumbnail": { GameThumbnail: "thumbnail" },
      "./GameGridSkeleton": { GameGridSkeleton: "skeleton" },
      "./HotSlider": { HotSlider: "slider" },
    }).GregmornGames;
  }
  const props = { lobby: true, catalog: { games, loading: false, error: "" } };
  try {
    const firstPanel = panel(departing);
    let tree = departing.render(() => firstPanel(props));
    await tick();
    find(tree, node => node.type === "slider")[0].props.onEnd();
    tree = departing.render(() => firstPanel(props));
    tree.props.ref.current = { querySelector: () => ({ scrollLeft: 640 }) };
    find(tree, node => node.type === "button")[0].props.onClick();
    await tick();
    assert.equal(requestBody.returnTo, "/?cat=Hot#games");
    assert.equal(window.assigned, "https://provider.example/play");
    assert.deepEqual(nav.readProviderGameReturn(), { ...state, category: "All", search: "", provider: "" });
    nav.rememberGameReturn({ ...state, category: "All" });
    departing.unmount();
    const secondPanel = panel(returning);
    returning.render(() => secondPanel(props));
    await tick();
    tree = returning.render(() => secondPanel(props));
    assert.equal(find(tree, node => node.type === "input" || node.type === "select").length, 0);
    const slider = find(tree, node => node.type === "slider")[0];
    assert.equal(slider.props.hot.length, 120);
    assert.equal(slider.props.initialScrollLeft, 640);
    find(tree, node => node.type === "button")[0].props.onClick();
    await tick();
    env.event("pageshow", { persisted: true });
    tree = returning.render(() => secondPanel(props));
    assert.equal(find(tree, node => node.type === "button")[0].props.disabled, false, "bfcache return clears Opening state");
  } finally { departing.unmount(); returning.unmount(); env.restore(); }
});

test("All Games restores a manually selected category, not just the category in its URL", async () => {
  const env = browser(), runtime = hooks(), nav = navigation({ useEffect: () => {} });
  const component = load("src\\app\\games-all\\AllGames.tsx", {
    react: runtime.react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "link" },
    "next/navigation": { useSearchParams: () => new URLSearchParams("cat=All") },
    "@/components/lobby/Lobby": { CAT_ICONS: {}, PROVIDER_CATS: [{ key: "All" }, { key: "Hot" }], Header: "header", BottomNav: "nav" },
    "@/lib/useDb": { useSession: () => ({ user: null }) },
    "@/lib/i18n/client": { useI18n: () => ({ t: value => value }) },
    "@/components/Icons": { ArrowLeftIcon: "icon", TrophyIcon: "icon", GamepadIcon: "icon" },
    "@/lib/gameNavigation": nav,
    "@/components/lobby/GregmornGames": { GregmornGames: "games" },
    "@/lib/useProviderCatalog": { useProviderCatalog: () => ({}) },
  });
  try {
    nav.rememberGameReturn(state);
    runtime.render(() => component.default());
    await tick();
    const tree = runtime.render(() => component.default());
    assert.equal(find(tree, node => node.type === "games")[0].props.category, "Hot");
  } finally { runtime.unmount(); env.restore(); }
});

test("provider slider restores its saved horizontal offset after mounting", () => {
  const runtime = hooks();
  const slider = load("src\\components\\lobby\\HotSlider.tsx", {
    react: runtime.react, "react/jsx-runtime": { jsx, jsxs: jsx },
  });
  let tree;
  runtime.render(() => {
    tree = slider.HotSlider({ hot: [], rest: [], onPhase: () => {}, initialScrollLeft: 640 });
    find(tree, node => node.props?.["data-provider-slider"] !== undefined)[0].props.ref.current = { scrollLeft: 0 };
  });
  assert.equal(find(tree, node => node.props?.["data-provider-slider"] !== undefined)[0].props.ref.current.scrollLeft, 640);
  runtime.unmount();
});

test("browser back refreshes lobby data without unmounting the games panel", async () => {
  const env = browser("/"), runtime = hooks();
  globalThis.fetch = async () => Response.json({ links: {}, leaderboard: [] });
  const component = load("src\\app\\HomeClient.tsx", {
    react: runtime.react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/lobby/Lobby": { Header: "header", Lobby: "lobby", CONTAINER: "container" },
    "@/lib/useDb": { useSession: () => ({ user: { role: "client" }, loading: false }), PageLoadingSkeleton: "skeleton" },
    "@/lib/useProviderCatalog": { useProviderCatalog: () => ({ games: [], loading: false, error: "" }) },
  });
  try {
    runtime.render(() => component.default({ cat: "Hot" }));
    await tick();
    assert.equal(runtime.render(() => component.default({ cat: "Hot" })).type, "lobby");
    for (const [event, detail] of [["pageshow", { persisted: true }], ["popstate", {}]]) {
      env.event(event, detail);
      assert.equal(runtime.render(() => component.default({ cat: "Hot" })).type, "lobby", "background refresh must retain the panel component");
      await tick();
    }
  } finally { runtime.unmount(); env.restore(); }
});
