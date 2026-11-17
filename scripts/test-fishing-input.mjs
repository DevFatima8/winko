import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

function harness(onAccept, onComplete = async () => true) {
  const compile = path => ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const config = { exports: {} };
  new Function("require", "module", "exports", compile("src\\components\\fishing-arcade\\game\\config.ts"))(
    () => ({ BET_PRESETS: [10, 20, 50] }), config, config.exports);
  const engineModule = { exports: {} };
  const sounds = [], changes = [], completions = [], checkpoints = [], accepts = [], errors = [];
  new Function("require", "module", "exports", "window", "crypto", "console", "cancelAnimationFrame",
    compile("src\\components\\fishing-arcade\\game\\engine.ts"))(name => {
    if (name === "./config") return config.exports;
    if (name === "./draw") return { makeBackground: () => ({}), makeVignette: () => ({}) };
    if (name === "./sound") return { sfx: new Proxy({}, { get: (_, sound) => () => sounds.push(sound) }) };
    throw new Error(`Unexpected engine import ${name}`);
  }, engineModule, engineModule.exports, {
    devicePixelRatio: 1, addEventListener() {}, removeEventListener() {},
  }, { randomUUID }, { error: (...args) => errors.push(args) }, () => {});
  const engine = new engineModule.exports.FishingEngine({
    getContext: () => ({}), addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  }, {
    onChange: snapshot => changes.push(snapshot), onBigWin() {}, onNoFunds() {},
    onCheckpoint: snapshot => checkpoints.push(structuredClone(snapshot)),
    onAccept: (...args) => { accepts.push(args); return onAccept(...args); },
    onComplete: async (wagerId, claim) => { completions.push({ wagerId, claim }); return onComplete(wagerId, claim); },
  });
  const fish = {
    ...engine.snapshot().fish[0], id: 100, x: 640, y: 300, baseY: 300,
    vx: 0, vy: 0, drift: 0, wobbleAmp: 0, claimed: false,
    sp: { ...config.exports.SPECIES[0], mult: 7 },
  };
  engine.fish = [fish];
  engine.spawnTimer = 100;
  engine.setBalance(1000);
  engine.setBetIndex(0);
  engine.setInputEnabled(true);
  const press = (clientX = 640, clientY = 300) => {
    engine.onDown({ clientX, clientY, preventDefault() {} });
    engine.onUp();
  };
  const advance = (count = 30) => { for (let i = 0; i < count; i++) engine.update(0.05); };
  return { engine, press, advance, sounds, changes, completions, checkpoints, accepts, errors };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function fishingUI(balance = 1000, presets = [10, 20, 50, 100, 200]) {
  const states = [], refs = [], effects = [], pendingEffects = [], timers = [];
  let index = 0, refIndex = 0, effectIndex = 0, walletBalance = balance;
  const imports = {
    react: {
      useState(initial) {
        const key = index++;
        if (!(key in states)) states[key] = initial;
        return [states[key], value => { states[key] = typeof value === "function" ? value(states[key]) : value; }];
      },
      useRef: current => refs[refIndex++] ??= { current },
      useEffect(fn, deps) {
        const key = effectIndex++, previous = effects[key];
        if (!deps || !previous || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
          pendingEffects.push(() => { previous?.cleanup?.(); effects[key] = { deps, cleanup: fn() }; });
        }
      },
      useLayoutEffect() {}, useCallback: fn => fn,
    },
    "react/jsx-runtime": jsx, "next/link": { default: "a" },
    "@/lib/gameBetLimits": { gameBetError: amount => amount < 10 ? "Minimum bet is Rs. 10." : null, MIN_GAME_BET: 10, MAX_GAME_BET: 100000 },
    "@/lib/walletSync": { useGameBalance: () => [walletBalance, () => {}], useDailyPoolMode: () => false },
    "./game/config": { BETS: presets, H: 720, W: 1280, START_BALANCE: 1000, SPECIES: [], formatNum: String },
    "./game/engine": {}, "./FishIcon": { default: "fish-icon" }, "./fishing-arcade.css": {},
    "./game/sound": { initAudio() {}, setSoundEnabled() {}, sfx: { click() {} } },
  };
  const code = ts.transpileModule(readFileSync("src\\components\\fishing-arcade\\FishingGame.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "window", "setTimeout", "clearTimeout", code)(name => {
    assert.ok(name in imports, name);
    return imports[name];
  }, module, module.exports, { addEventListener() {}, removeEventListener() {} },
  callback => { timers.push(callback); return timers.length; }, () => {});
  const render = () => {
    index = 0;
    refIndex = 0;
    effectIndex = 0;
    const nodes = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      nodes.push(node); visit(node.props?.children);
    };
    visit(module.exports.default({}));
    while (pendingEffects.length) pendingEffects.shift()();
    return nodes;
  };
  const named = name => render().find(node => node.props?.["aria-label"] === name);
  const preset = amount => render().find(node => node.type === "button" && node.props.children === amount);
  const inputs = () => render().filter(node => node.type === "input");
  return {
    render, named, preset, inputs,
    setBalance(value) { walletBalance = value; render(); },
    runTimers() { for (const callback of timers.splice(0)) callback(); },
    start() { render().find(node => node.type === "button" && node.props.className?.startsWith("start-btn ")).props.onClick(); render(); },
    outOfFunds: () => render().some(node => node.props?.children === "OUT OF Rs."),
  };
}

test("Fishing presets display the exact stake without a keyboard; only Edit opens custom typing", () => {
  const { render, named, preset, inputs } = fishingUI();
  assert.equal(inputs().length, 0);
  preset(200).props.onClick();
  assert.equal(named("Starting bet per shot").props.children, 200);
  assert.equal(named("Selected bet per shot").props.children, 200);
  assert.equal(inputs().length, 0);
  named("Edit starting bet").props.onClick();
  named("Starting bet per shot").props.onChange({ target: { value: "175" } });
  assert.equal(named("Starting bet per shot").props.value, 175);
  preset(100).props.onClick();
  assert.equal(inputs().length, 0);
  render().find(node => node.type === "button" && node.props.className?.startsWith("start-btn ")).props.onClick();
  preset(20).props.onClick();
  assert.equal(named("Selected bet per shot").props.children, 20);
  assert.equal(inputs().length, 0);
  named("Edit custom bet").props.onClick();
  named("Custom bet amount").props.onChange({ target: { value: "125" } });
  named("Done editing bet").props.onClick();
  assert.equal(named("Selected bet per shot").props.children, 125);
});

test("Rs. 541 allows Rs. 50 and Rs. 10 shots even when the first saved preset is Rs. 10,000", () => {
  const h = fishingUI(541, [10000, 20, 50, 100, 200]);
  h.preset(50).props.onClick();
  h.start();
  h.runTimers();
  assert.equal(h.outOfFunds(), false);
  assert.equal(h.named("Selected bet per shot").props.children, 50);
  h.named("Edit custom bet").props.onClick();
  h.named("Custom bet amount").props.onChange({ target: { value: "10" } });
  h.named("Done editing bet").props.onClick();
  assert.equal(h.named("Selected bet per shot").props.children, 10);
  h.runTimers();
  assert.equal(h.outOfFunds(), false);

  h.setBalance(9.99);
  h.runTimers();
  assert.equal(h.outOfFunds(), true);
  h.setBalance(10);
  assert.equal(h.outOfFunds(), false, "exact minimum balance must dismiss the blocking overlay");
  h.setBalance(0);
  h.runTimers();
  assert.equal(h.outOfFunds(), true);
  h.setBalance(541);
  assert.equal(h.outOfFunds(), false, "a wallet credit must not leave the player stuck behind stale insufficient funds");
});

test("the engine accepts an exact Rs. 10 shot and rejects it only below the selected stake", async () => {
  const h = harness(async wagerId => ({ wagerId, win: false }));
  h.engine.setCustomBet(10);
  h.engine.setBalance(9.99);
  h.press();
  assert.equal(h.accepts.length, 0);
  h.engine.setBalance(10);
  h.advance(11);
  h.press();
  await flush();
  assert.equal(h.accepts.length, 1);
  assert.equal(h.accepts[0][1], 10);
});

test("pointerdown immediately launches one visual while a delayed receipt blocks all settlement and new stakes", async () => {
  let release;
  const h = harness(() => new Promise(resolve => { release = resolve; }));
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.9;
    h.press();
  } finally { Math.random = originalRandom; }
  const before = h.engine.snapshot();
  assert.equal(before.pending.win, false, "server receipt must override even a sampled visual miss");
  assert.equal(before.bullets.length, 1, "no animation frame or wallet response needed to launch");
  assert.equal(h.sounds.filter(sound => sound === "shoot").length, 1);
  assert.equal(h.engine.recoil, 12);
  assert.equal(h.accepts.length, 1);
  assert.equal(h.changes.at(-1).shots, 0, "a visual is not a confirmed wager");
  assert.equal(h.changes.at(-1).balance, 1000);
  h.engine.setAuto(true);
  h.advance();
  h.press();
  const waiting = h.engine.snapshot();
  assert.equal(waiting.bullets.length, 1);
  assert.notEqual(waiting.bullets[0].y, before.bullets[0].y, "visual flies during wallet latency");
  assert.equal(waiting.bullets[0].waitingAtImpact, true);
  assert.equal(h.accepts.length, 1, "held/auto/repeated input cannot queue more unconfirmed spending");
  assert.deepEqual(h.completions, []);
  release({ wagerId: before.pending.wagerId, win: true });
  await flush();
  assert.equal(h.engine.snapshot().pending, null);
  assert.equal(h.changes.at(-1).shots, 1);
  assert.equal(h.sounds.filter(sound => sound === "shoot").length, 1, "receipt cannot replay the shot");
  h.engine.setAuto(false);
  h.advance();
  await flush();
  assert.deepEqual(h.completions, [{ wagerId: before.pending.wagerId, claim: 70 }]);
});

for (const failure of ["null", "throw"]) {
  test(`a ${failure} acceptance preserves the same saved shot for retry without payout or duplicate visual`, async () => {
    let attempts = 0;
    const h = harness(async wagerId => {
      if (++attempts > 1) return { wagerId, win: false };
      if (failure === "throw") throw new Error("receipt unavailable");
      return null;
    });
    h.press();
    await flush();
    h.advance();
    const saved = h.engine.snapshot();
    assert.ok(saved.pending);
    assert.equal(h.engine.accepting, false);
    assert.equal(h.engine.auto, false);
    assert.equal(h.engine.pointer.down, false);
    assert.deepEqual(h.completions, []);
    assert.equal(h.errors.length, failure === "throw" ? 1 : 0);
    if (failure === "throw") {
      assert.equal(h.errors[0][0], "[fishing acceptance]");
      assert.equal(h.errors[0][1].message, "receipt unavailable");
    }
    h.press();
    await flush();
    assert.equal(h.accepts.length, 2);
    assert.equal(h.accepts[0][0], h.accepts[1][0], "wallet transport reuses its idempotent accept operation");
    assert.equal(h.sounds.filter(sound => sound === "shoot").length, 1);
    h.advance();
    await flush();
    assert.deepEqual(h.completions, [{ wagerId: saved.pending.wagerId, claim: 0 }]);
  });
}

test("server loss overrides a sampled win and immediate repeated presses respect cooldown", async () => {
  const h = harness(async wagerId => ({ wagerId, win: false }));
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    h.press();
  } finally { Math.random = originalRandom; }
  assert.equal(h.engine.snapshot().pending.win, true);
  await flush();
  h.press();
  assert.equal(h.accepts.length, 1);
  assert.equal(h.engine.snapshot().bullets[0].win, false);
  h.advance();
  await flush();
  assert.equal(h.completions.length, 1);
  assert.equal(h.completions[0].claim, 0);
  h.press();
  await flush();
  assert.equal(h.accepts.length, 2, "firing resumes after the existing cooldown");
});

test("auto fire retains its cadence after confirmation without doubling the initial press", async () => {
  const h = harness(async wagerId => ({ wagerId, win: false }));
  h.engine.setAuto(true);
  h.press();
  await flush();
  h.advance(5);
  assert.equal(h.accepts.length, 1, "auto cannot bypass the 270ms cooldown");
  h.advance(1);
  await flush();
  assert.equal(h.accepts.length, 2);
  assert.notEqual(h.accepts[0][0], h.accepts[1][0]);
  assert.equal(h.sounds.filter(sound => sound === "shoot").length, 2);
});

test("disabled input and insufficient or invalid balances cannot launch a new immediate shot", () => {
  for (const balance of [1000, 0, 9, NaN, Infinity]) {
    const h = harness(() => { throw new Error("blocked input must not submit a wager"); });
    h.engine.setBalance(balance);
    h.engine.setInputEnabled(false);
    h.press();
    assert.equal(h.engine.snapshot().bullets.length, 0);
    assert.equal(h.engine.snapshot().pending, null);
    if (balance !== 1000) {
      h.engine.setInputEnabled(true);
      h.press();
      assert.equal(h.engine.snapshot().bullets.length, 0);
      assert.equal(h.engine.snapshot().pending, null);
    }
    assert.equal(h.accepts.length, 0);
    assert.equal(h.sounds.includes("shoot"), false);
  }
});

test("destroying an engine during acceptance retains its saved pending flight without late persistence or payout", async () => {
  let release;
  const h = harness(() => new Promise(resolve => { release = resolve; }));
  h.press();
  h.advance(2);
  h.engine.raf = 1;
  h.engine.destroy();
  const saved = structuredClone(h.checkpoints.at(-1));
  const checkpointCount = h.checkpoints.length;
  const changeCount = h.changes.length;
  assert.ok(saved.pending);
  assert.equal(saved.bullets.length, 1);
  release({ wagerId: saved.pending.wagerId, win: true });
  await flush();
  assert.equal(h.checkpoints.length, checkpointCount, "late receipt must not overwrite recovery or another mount");
  assert.equal(h.changes.length, changeCount);
  assert.equal(h.engine.accepting, false);
  assert.deepEqual(h.completions, []);
  const recovered = harness(async wagerId => ({ wagerId, win: true }));
  await recovered.engine.restore(saved, [saved.pending.wagerId]);
  recovered.advance();
  await flush();
  assert.deepEqual(recovered.completions, [{ wagerId: saved.pending.wagerId, claim: 70 }]);
  assert.equal(recovered.accepts[0][0], saved.pending.wagerId);
});

test("saved provisional flight resumes in place and reconciles once without another projectile", async () => {
  const original = harness(() => new Promise(() => {}));
  original.press();
  original.advance(2);
  const saved = structuredClone(original.engine.snapshot());
  const h = harness(async wagerId => ({ wagerId, win: true }));
  await h.engine.restore(saved, [saved.pending.wagerId]);
  assert.equal(h.accepts.length, 1);
  assert.equal(h.accepts[0][0], saved.pending.wagerId);
  assert.equal(h.engine.snapshot().bullets.length, 1);
  assert.equal(h.engine.snapshot().bullets[0].y, saved.bullets[0].y);
  assert.equal(h.sounds.filter(sound => sound === "shoot").length, 0);
  h.advance();
  await flush();
  assert.deepEqual(h.completions, [{ wagerId: saved.pending.wagerId, claim: 70 }]);
});

test("legacy pending-only saves still launch once, while accepted bullets never re-accept", async () => {
  const original = harness(() => new Promise(() => {}));
  original.press();
  const saved = structuredClone(original.engine.snapshot());
  saved.bullets = [];
  const h = harness(async wagerId => ({ wagerId, win: false }));
  await h.engine.restore(saved, [saved.pending.wagerId]);
  assert.equal(h.engine.snapshot().bullets.length, 1);
  assert.equal(h.sounds.filter(sound => sound === "shoot").length, 1);
  const accepted = structuredClone(h.engine.snapshot());
  const resumed = harness(() => { throw new Error("must not accept a confirmed bullet again"); });
  await resumed.engine.restore(accepted, [accepted.bullets[0].wagerId]);
  resumed.advance();
  await flush();
  assert.equal(resumed.accepts.length, 0);
  assert.equal(resumed.completions.length, 1);
  assert.equal(resumed.completions[0].claim, 0);
});

for (const win of [false, true]) {
  test(`a ${win ? "winning" : "losing"} shot stops at the fish surface and draws its net before delayed settlement`, async () => {
    let settle;
    const h = harness(async wagerId => ({ wagerId, win }), () => new Promise(resolve => { settle = resolve; }));
    h.press();
    await flush();
    for (let frame = 0; frame < 20 && !h.engine.snapshot().bullets[0]?.impact; frame++) h.advance(1);
    const bullet = h.engine.snapshot().bullets[0];
    const fish = h.engine.snapshot().fish[0];
    assert.ok(bullet.impact, "swept collision must stop the projectile");
    const rx = fish.sp.w * fish.sp.hit[0] + 8, ry = fish.sp.h * fish.sp.hit[1] + 8;
    const distance = ((bullet.x - fish.x) / rx) ** 2 + ((bullet.y - fish.y) / ry) ** 2;
    assert.ok(Math.abs(distance - 1) < 0.00001, `contact must be on the fish, not past it: ${distance}`);
    assert.equal(bullet.waitingAtImpact, true);
    assert.deepEqual({ x: h.engine.nets[0].x, y: h.engine.nets[0].y }, bullet.impact);
    assert.equal(h.changes.at(-1).wins, 0, "contact alone cannot credit a win");
    h.advance(2);
    assert.deepEqual(h.engine.snapshot().bullets[0].impact, bullet.impact);
    settle(true);
    await flush();
    h.advance(1);
    assert.equal(h.engine.snapshot().bullets.length, 0);
    assert.equal(h.completions.length, 1);
    if (win) assert.deepEqual({ x: h.engine.nets.at(-1).x, y: h.engine.nets.at(-1).y }, bullet.impact);
  });
}

test("swept collision catches a small or rotated fish between frames and does not hit an off-path fish", () => {
  const h = harness(async wagerId => ({ wagerId, win: true }));
  const fish = h.engine.fish[0];
  fish.sp = { ...fish.sp, w: 12, h: 8, hit: [.5, .5] };
  fish.tilt = .4;
  assert.notEqual(h.engine.fishContact(fish, 640, 350, 640, 250), null);
  assert.equal(h.engine.fishContact(fish, 600, 350, 600, 250), null);
});

test("manual fire follows the aim instead of bending towards a remote fish or awarding a missed target", async () => {
  const h = harness(async wagerId => ({ wagerId, win: true }));
  h.engine.fish[0].x = 900;
  h.press();
  await flush();
  assert.ok(Math.abs(h.engine.snapshot().bullets[0].vx) < 1e-10);
  for (let frame = 0; frame < 20 && !h.engine.snapshot().bullets[0]?.impact; frame++) h.advance(1);
  await flush();
  assert.deepEqual(h.completions.map(row => row.claim), [0]);
  assert.equal(h.engine.fish[0].dying, false);
  assert.deepEqual({ x: h.engine.nets.at(-1).x, y: h.engine.nets.at(-1).y }, { x: 640, y: 300 });
});

test("landscape width changes keep aim, cannon and saved in-flight shots aligned without a second acceptance", async () => {
  const original = harness(() => new Promise(() => {}));
  original.engine.setViewportWidth(1600);
  original.press();
  original.advance(2);
  const before = original.engine.snapshot();
  assert.equal(before.width, 1600);
  assert.equal(before.bullets[0].x, 800);
  original.engine.setViewportWidth(2000);
  const saved = structuredClone(original.engine.snapshot());
  assert.equal(saved.bullets[0].x, 1000);
  assert.equal(saved.pending.tx, 1000);
  assert.equal(saved.fish[0].x, 1000);
  const recovered = harness(async wagerId => ({ wagerId, win: true }));
  await recovered.engine.restore(saved, [saved.pending.wagerId]);
  assert.equal(recovered.engine.snapshot().bullets[0].x, 640);
  assert.equal(recovered.engine.cannon.x, 640);
  recovered.advance();
  await flush();
  assert.equal(recovered.accepts.length, 1);
  assert.equal(recovered.accepts[0][0], saved.pending.wagerId);
  assert.deepEqual(recovered.completions.map(row => row.claim), [70]);
});

test("the first fish touched intercepts a manual shot rather than letting it pass through to a distant fish", async () => {
  const h = harness(async wagerId => ({ wagerId, win: true }));
  const front = { ...h.engine.fish[0], id: 101, y: 430, baseY: 430, sp: { ...h.engine.fish[0].sp, mult: 2 } };
  h.engine.fish.push(front);
  h.press();
  await flush();
  for (let frame = 0; frame < 20 && !h.engine.snapshot().bullets[0]?.impact; frame++) h.advance(1);
  await flush();
  assert.equal(h.engine.snapshot().bullets[0].targetId, 101);
  assert.equal(h.engine.fish.find(fish => fish.id === 100).dying, false);
  assert.deepEqual(h.completions.map(row => row.claim), [20]);
});
