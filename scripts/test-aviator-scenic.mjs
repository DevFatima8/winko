import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as THREE from "three";

function load(file, imports) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
function scene(overrides = {}, presets = [10, 15, 20, 25, 50]) {
  const values = [], calls = [];
  let cursor = 0, tree;
  const { AviatorScenicView } = load("src\\components\\AviatorScenicView.tsx", {
    react: { useEffect() {}, useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], value => { values[index] = value; }]; } },
    "react/jsx-runtime": jsx, "next/link": { default: "a" },
    "lucide-react": Object.fromEntries(["ArrowLeft", "House", "Menu", "Signal", "Volume2", "VolumeX", "X"].map(name => [name, name])),
    "@/lib/betPresets": { BET_PRESETS: presets },
  });
  const state = {
    config: { slots: 2, minBet: 0.01, maxBet: 50000, waitMs: 6000 }, balance: 1000,
    round: { id: 42 }, history: [{ id: 41, crashPoint: 2.5 }], totals: { count: 0, amount: 0, cashed: 0 },
    bets: [], myBets: [], queued: [], myHistory: [], top: [], ...overrides.state,
  };
  const props = {
    state, phase: "waiting", multiplier: 1, countdown: 5.2,
    panels: Array.from({ length: 3 }, () => ({ amount: "100.00", autoBet: false, autoCash: false, autoCashAt: "2.00", busy: false })),
    canvasRef: { current: null }, wrapRef: { current: null }, backHref: "/", sound: true, toast: null,
    ...overrides, state,
    ...Object.fromEntries(["onBet", "onCancel", "onCashout", "onPanelChange", "onSound"].map(name => [name, (...args) => calls.push([name, ...args])])),
  };
  const nodes = () => {
    const all = [];
    const visit = node => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      all.push(node); visit(node.props?.children);
    };
    visit(tree); return all;
  };
  const render = () => { cursor = 0; tree = AviatorScenicView(props); };
  render();
  const text = () => {
    const get = node => node == null || typeof node === "boolean" ? "" : Array.isArray(node) ? node.map(get).join(" ") : typeof node === "object" ? get(node.props?.children) : String(node);
    return get(tree);
  };
  return { props, calls, render, text, nodes, find: predicate => { const node = nodes().find(predicate); assert.ok(node, "Expected UI node"); return node; } };
}

test("Aviator scenic view renders two readable panels, countdown, original canvas and real empty activity", () => {
  const s = scene();
  assert.equal(s.nodes().filter(node => node.props?.["aria-label"]?.startsWith("Bet panel")).length, 2);
  assert.match(s.text(), /NEXT ROUND.*Starts in\s+6\s+s/);
  assert.match(s.text(), /No bets placed in this round yet/);
  assert.equal(s.nodes().filter(node => node.type === "canvas").length, 1);
  const stage = s.find(node => node.props?.ref === s.props.wrapRef);
  assert.ok(stage.props.className.includes("h-[clamp(280px,44svh,470px)]"), "Keep the existing mobile stage size");
  assert.ok(stage.props.className.includes("md:h-[clamp(160px,calc(100dvh-480px),470px)]"), "Reserve desktop space for every betting control");
  assert.ok(s.nodes().some(node => node.props?.className?.includes("md:grid-cols-5")), "Use one desktop row for the five preset buttons");
  s.find(node => node.props?.["data-action"] === "bet").props.onClick();
  assert.deepEqual(s.calls, [["onBet", 0]]);
});

test("Running, pending and queued buttons delegate only to the existing slot handlers", () => {
  const running = scene({ phase: "running", multiplier: 2.5 });
  running.find(node => node.props?.["data-action"] === "bet-next").props.onClick();
  assert.deepEqual(running.calls, [["onBet", 0]]);
  const own = { slot: 0, bet: 100, outcome: "pending" };
  const cashout = scene({ phase: "running", state: { myBets: [own] } });
  cashout.find(node => node.props?.["data-action"] === "cashout").props.onClick();
  assert.deepEqual(cashout.calls, [["onCashout", 0]]);
  const cancel = scene({ state: { myBets: [own] } });
  cancel.find(node => node.props?.["data-action"] === "cancel").props.onClick();
  assert.deepEqual(cancel.calls, [["onCancel", 0]]);
  const queued = scene({ phase: "crashed", state: { queued: [{ slot: 0, bet: 100 }] } });
  queued.find(node => node.props?.["data-action"] === "cancel").props.onClick();
  assert.deepEqual(queued.calls, [["onCancel", 0]]);
});

test("Aviator shows the next countdown while a full crash-state refresh is late, without enabling cashout", () => {
  const s = scene({ phase: "crashed", countdown: 4.8, multiplier: 3.3 });
  assert.match(s.text(), /NEXT ROUND.*Starts in\s+5\s+s/);
  assert.doesNotMatch(s.text(), /CRASHED!/);
  s.find(node => node.props?.["data-action"] === "bet-next").props.onClick();
  assert.deepEqual(s.calls, [["onBet", 0]]);
  s.props.countdown = 0;
  s.render();
  assert.match(s.text(), /CRASHED!/);
});

test("Aviator shows all five shared amounts directly and uses profile updates without adding to the stake", () => {
  const presets = [10, 15, 20, 25, 50];
  const s = scene({}, presets);
  const quickButtons = () => s.nodes().filter(node => node.type === "button" && node.props.className?.includes("min-h-8"));
  assert.deepEqual(quickButtons().map(node => node.props.children), [...presets, ...presets]);
  quickButtons()[1].props.onClick();
  assert.deepEqual(s.calls.at(-1), ["onPanelChange", 0, { amount: "15.00" }]);
  presets.splice(0, 5, 0.01, 5, 30, 100, 50000);
  s.render();
  assert.deepEqual(quickButtons().map(node => node.props.children), [...presets, ...presets]);
  quickButtons()[0].props.onClick();
  assert.deepEqual(s.calls.at(-1), ["onPanelChange", 0, { amount: "0.01" }]);
  s.props.state.queued = [{ slot: 0, bet: 15 }];
  s.render();
  assert.ok(quickButtons().slice(0, 5).every(node => node.props.disabled));
});

test("Amount bounds, auto controls, busy state and histories remain available", () => {
  const s = scene();
  const input = s.find(node => node.props?.["aria-label"] === "Bet amount 1");
  input.props.onBlur();
  s.props.panels[0].amount = "999999";
  s.render();
  s.find(node => node.props?.["aria-label"] === "Bet amount 1").props.onBlur();
  assert.deepEqual(s.calls.slice(0, 2), [["onPanelChange", 0, { amount: "100.00" }], ["onPanelChange", 0, { amount: "999999.00" }]]);
  s.find(node => node.props?.["aria-label"] === "Auto Bet 1").props.onChange({ target: { checked: true } });
  assert.deepEqual(s.calls.at(-1), ["onPanelChange", 0, { autoBet: true }]);
  s.props.panels[0].busy = true;
  s.render();
  assert.equal(s.find(node => node.props?.["data-action"] === "bet").props.disabled, true);
  s.find(node => node.type === "button" && node.props.children === "results").props.onClick();
  s.render();
  assert.match(s.text(), /41.*2.50/);
});

test("Compact header retains lobby, balance, deposit, menu and sound without a duplicate brand bar", () => {
  const s = scene();
  assert.equal(s.nodes().filter(node => node.type === "header").length, 1);
  assert.doesNotMatch(s.text(), /WINKOX/);
  assert.ok(s.find(node => node.props?.["aria-label"] === "Back to Lobby"));
  s.find(node => node.props?.["aria-label"] === "Game menu").props.onClick();
  s.render();
  assert.match(s.text(), /My Bet History/);
});

test("Round ID is absent from the history strip and only the header has a sound button", () => {
  const s = scene();
  assert.doesNotMatch(s.text(), /Round ID/);
  assert.equal(s.nodes().filter(node => node.props?.["aria-label"] === "Mute sound").length, 1);
  s.find(node => node.props?.["aria-label"] === "Mute sound").props.onClick();
  assert.deepEqual(s.calls, [["onSound"]]);
  s.find(node => node.type === "button" && node.props.children === "History").props.onClick();
  s.render();
  assert.match(s.text(), /41.*2.50/);
});

const scenery = () => load("src\\lib\\aviatorScenery.ts", { three: THREE });
test("Actual 3D meshes persist across rounds: trees and buildings never morph or disappear on a timer", () => {
  const { createAviatorWorld, advanceAviatorWorld, disposeAviatorWorld } = scenery();
  const world = createAviatorWorld();
  assert.ok(world.camera instanceof THREE.PerspectiveCamera);
  const before = [];
  world.scene.traverse(node => {
    if (node instanceof THREE.InstancedMesh) before.push({ node, count: node.count, matrices: [...node.instanceMatrix.array], colors: node.instanceColor ? [...node.instanceColor.array] : null });
  });
  assert.equal(before.length, 56);
  assert.equal(world.chunks.length, 7);
  for (let frame = 0; frame < 1800; frame++) {
    const phase = frame < 600 ? "running" : frame < 900 ? "crashed" : "waiting";
    advanceAviatorWorld(world, frame * 1000 / 60, phase, 10000);
  }
  for (const item of before) {
    assert.equal(item.node.count, item.count);
    assert.deepEqual([...item.node.instanceMatrix.array], item.matrices);
    assert.deepEqual(item.node.instanceColor ? [...item.node.instanceColor.array] : null, item.colors);
  }
  world.scene.updateMatrixWorld();
  world.scene.traverse(node => node.matrixWorld.elements.forEach(value => assert.ok(Number.isFinite(value))));
  disposeAviatorWorld(world);
  assert.equal(world.scene.children.length, 0);
});

test("Terrain motion is refresh-rate independent, continuous at cell crossings and recycled behind the camera", () => {
  const { createAviatorWorld, advanceAviatorWorld, disposeAviatorWorld } = scenery();
  const slow = createAviatorWorld(), fast = createAviatorWorld();
  try {
    for (let frame = 0; frame <= 600; frame++) advanceAviatorWorld(slow, frame * 1000 / 30, "running", null);
    for (let frame = 0; frame <= 2400; frame++) advanceAviatorWorld(fast, frame * 1000 / 120, "running", null);
    assert.ok(Math.abs(slow.distance - fast.distance) < 1e-6);
    const previous = fast.chunks.map(chunk => chunk.position.z);
    advanceAviatorWorld(fast, 20000 + 1000 / 120, "crashed", 20000);
    fast.chunks.forEach((chunk, index) => {
      const change = chunk.position.z - previous[index];
      assert.ok(Math.abs(change) < 0.2 || change < -839 && previous[index] > fast.camera.position.z + 100);
    });
    let wraps = 0;
    for (let frame = 1; frame < 4000; frame++) {
      const old = fast.chunks.map(chunk => chunk.position.z);
      advanceAviatorWorld(fast, 20000 + frame * 1000 / 60, "running", null);
      fast.chunks.forEach((chunk, index) => {
        if (chunk.position.z < old[index] - 100) {
          wraps++;
          assert.ok(old[index] > fast.camera.position.z + 100, "Entire segment is behind the camera before recycling");
          assert.ok(chunk.position.z < -650, "Replacement enters beyond the fog");
        }
      });
    }
    assert.ok(wraps > 3);
    const distance = fast.distance;
    advanceAviatorWorld(fast, 1000000, "waiting", null);
    assert.ok(Math.abs(fast.distance - distance) <= 1.151, "Background suspension must not jump the world");
  } finally {
    disposeAviatorWorld(slow); disposeAviatorWorld(fast);
  }
});

test("3D geometries, instancing buffers and materials are released on unmount", () => {
  const { createAviatorWorld, disposeAviatorWorld } = scenery();
  const world = createAviatorWorld();
  let geometries = 0, materials = 0, instances = 0;
  const seen = new Set();
  world.scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!seen.has(node.geometry)) { seen.add(node.geometry); node.geometry.addEventListener("dispose", () => geometries++); }
    const paints = Array.isArray(node.material) ? node.material : [node.material];
    for (const paint of paints) if (!seen.has(paint)) { seen.add(paint); paint.addEventListener("dispose", () => materials++); }
    if (node instanceof THREE.InstancedMesh) node.addEventListener("dispose", () => instances++);
  });
  disposeAviatorWorld(world);
  assert.ok(geometries > 8);
  assert.ok(materials > 8);
  assert.equal(instances, 56);
});

test("City districts contain varied permanent buildings, rooftop details, balconies and woodland", () => {
  const { createAviatorWorld, disposeAviatorWorld } = scenery();
  const world = createAviatorWorld();
  try {
    assert.ok(world.chunks.some(chunk => chunk.userData.district === "woodland"));
    assert.ok(world.chunks.some(chunk => chunk.userData.district === "waterfront-city"));
    for (const chunk of world.chunks) {
      const buildings = chunk.getObjectByName("city-buildings");
      const rooftops = chunk.getObjectByName("rooftop-details");
      const balconies = chunk.getObjectByName("facade-balconies");
      assert.ok(buildings instanceof THREE.InstancedMesh);
      assert.equal(buildings.count, chunk.userData.district === "woodland" ? 8 : 24);
      assert.equal(rooftops.count, buildings.count * 2);
      assert.equal(balconies.count, buildings.count * 3);
      const heights = new Set();
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < buildings.count; i++) {
        buildings.getMatrixAt(i, matrix);
        heights.add(Math.round(matrix.elements[5]));
      }
      assert.ok(heights.size > 2);
    }
  } finally {
    disposeAviatorWorld(world);
  }
});

test("reference-style plane stays small, centred, banks gently and falls away on a visible crash", () => {
  const { createAviatorWorld, advanceAviatorWorld, disposeAviatorWorld } = scenery();
  const world = createAviatorWorld();
  try {
    for (let frame = 0; frame <= 120; frame++) advanceAviatorWorld(world, frame * 1000 / 60, "running", null);
    assert.ok(Math.abs(world.plane.position.x) < 0.6);
    assert.equal(world.plane.scale.x, 1.05);
    assert.ok(Math.abs(world.plane.rotation.z) < 0.09);
    const altitude = world.plane.position.y;
    const z = world.plane.position.z;
    advanceAviatorWorld(world, 2016, "crashed", 1);
    assert.equal(world.crashElapsed, 0, "An old server timestamp cannot skip the fall");
    assert.ok(world.impact.visible);
    for (let frame = 1; frame <= 120; frame++) advanceAviatorWorld(world, 2016 + frame * 1000 / 60, "crashed", 1);
    assert.ok(world.plane.position.y < altitude - 12);
    assert.ok(world.plane.position.z < z, "Crash must fall away, not expand towards the camera");
    assert.ok(world.plane.rotation.z > 3);
    assert.ok(world.plane.scale.x < 1.05);
    advanceAviatorWorld(world, 4050, "waiting", null);
    assert.equal(world.crashElapsed, 0);
    assert.ok(world.plane.visible);
    assert.equal(world.impact.visible, false);
    assert.equal(world.plane.scale.x, 1.05);
  } finally {
    disposeAviatorWorld(world);
  }
});
