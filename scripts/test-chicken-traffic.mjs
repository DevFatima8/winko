import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

function scene(file, names) {
  const text = readFileSync(join("src", "components", file), "utf8") + `\nexport const trafficTest = { ${names.join(", ")} };`;
  const source = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    assert.ok(["@/lib/client", "@/lib/gameAudio", "@/lib/walletSync", "@/lib/betPresets", "./ChickenDashGame", "next/link", "react", "react/jsx-runtime"].includes(name), `Unexpected import: ${name}`);
    return {};
  }, loaded, loaded.exports);
  return loaded.exports.trafficTest;
}

const dash = scene("ChickenDashGame.tsx", ["newVis", "update", "CAR_DIMS", "H", "ROW_Y"]);
const road = scene("ChickenRoadGame.tsx", ["newVis", "blockLane", "update", "CAR_SPEC", "H", "MANHOLE_Y", "roadChickenPose", "roadChickenScale", "roadCarScale", "parkedStopY", "displayedMultiplier", "drawRoadChicken"]);
const views = [
  { w: 900, h: 440, scale: 1, dpr: 1 },
  { w: 900, h: 300, scale: 0.8, dpr: 1 },
  { w: 900, h: 800, scale: 390 / 900, dpr: 2 },
  { w: 900, h: 620, scale: 1.7, dpr: 2 },
];

for (const [name, engine] of [["Chicken Dash", dash], ["Chicken Road 2", road]]) {
  test(`${name} returns to the start after the full-crossing celebration`, () => {
    const table = [1.05, 1.1, 1.25];
    const v = engine.newVis(table);
    const startX = v.cx;
    v.status = "finished";
    v.finishedAt = 1000;
    v.pos = table.length + 1;
    v.cx = 700;
    v.camX = 500;
    v.camInit = true;
    v.passed.fill(true);
    engine.update(v, 16, 2799, views[0]);
    assert.equal(v.pos, table.length + 1, "Keep the finish visible for 1.8 seconds");
    engine.update(v, 16, 2800, views[0]);
    assert.equal(v.status, "idle");
    assert.equal(v.pos, 0);
    assert.equal(v.cx, startX);
    assert.equal(v.finishedAt, null);
    assert.ok(v.passed.every(passed => !passed));
    assert.equal(v.hop, null);
    assert.equal(v.killer, null);
    assert.equal(v.dead, false);
    const fresh = engine.newVis(table);
    engine.update(fresh, 16, 2800, views[0]);
    const before = Math.abs(v.camX - fresh.camX);
    for (let i = 0; i < 120; i++) engine.update(v, 16, 2816 + i * 16, views[0]);
    assert.ok(Math.abs(v.camX - fresh.camX) < Math.min(1, before), "Camera pans smoothly back to the starting area");
    engine.update(v, 16, 5000, views[0]);
    assert.equal(v.cx, startX);
  });

  test(`${name} does not reset an active, cashed-out or dead round`, () => {
    for (const status of ["active", "cashed", "dead"]) {
      const v = engine.newVis([1.05, 1.1, 1.25]);
      v.status = status;
      v.pos = 2;
      v.cx = 300;
      v.finishedAt = 1000;
      engine.update(v, 16, 5000, views[0]);
      assert.equal(v.status, status);
      assert.equal(v.pos, 2);
      assert.equal(v.cx, 300);
    }
  });
}

test("Chicken Road 2 visual pose has grounded endpoints, a natural hop and time-based blinking", () => {
  const start = road.roadChickenPose(1000, 0);
  const middle = road.roadChickenPose(1000, 0.5);
  const end = road.roadChickenPose(1000, 1);
  assert.equal(start.lift, 0);
  assert.ok(Math.abs(end.lift) < 1e-9);
  assert.equal(middle.lift, 29);
  assert.ok(road.roadChickenPose(1000, 0.25).stride > 0);
  assert.ok(road.roadChickenPose(1000, 0.75).stride < 0);
  assert.equal(road.roadChickenPose(4500, null).eye, 0.08);
  assert.equal(road.roadChickenPose(1000, null).eye, 1);
  assert.deepEqual(road.roadChickenPose(1000, 0.25), road.roadChickenPose(1000, 0.25));
});

test("Chicken Road 2 finish animation keeps the final lane multiplier in range", () => {
  const table = [1.05, 1.1, 1.25];
  assert.equal(road.displayedMultiplier(table, 2, "active"), "1.1x");
  assert.equal(road.displayedMultiplier(table, 4, "finished"), "1.25x");
});

test("Chicken Road 2 shaded chicken renders finite geometry with balanced canvas state", () => {
  for (const progress of [null, 0, 0.25, 0.5, 0.75, 1]) {
    let saves = 0, gradients = 0;
    const ctx = new Proxy({}, {
      get: (_, name) => (...args) => {
        for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value));
        if (name === "save") saves++;
        if (name === "restore") saves--;
        if (name === "createRadialGradient") { gradients++; return { addColorStop() {} }; }
      },
      set: () => true,
    });
    road.drawRoadChicken(ctx, 98, 262, 1000, progress);
    assert.equal(saves, 0);
    assert.ok(gradients > 8);
  }
});

test("Chicken Road 2 chicken enlarges smoothly on narrow mobile canvas scales", () => {
  assert.equal(road.roadChickenScale(1), 1);
  assert.equal(road.roadChickenScale(0.8), 1);
  assert.ok(road.roadChickenScale(0.45) > 1 && road.roadChickenScale(0.45) < 1.4);
  assert.equal(road.roadChickenScale(0.3), 1.4);
});

test("Chicken Road 2 cars enlarge on mobile without crossing lane bounds or reducing parked clearance", () => {
  assert.equal(road.roadCarScale(1), 1);
  assert.ok(road.roadCarScale(0.45) > 1);
  for (const view of views) {
    const scale = road.roadCarScale(view.scale);
    for (const [type, { w, h }] of Object.entries(road.CAR_SPEC)) {
      assert.ok(w * scale < 92, "Scaled car width stays within its lane");
      const stopY = road.parkedStopY(type, view);
      const gap = (road.MANHOLE_Y * view.h / road.H - 72 - 28) - (stopY * view.h / road.H + h * scale / 2 + 5);
      assert.ok(gap * view.scale >= 14 - 1e-7, "Scaled parked car preserves the existing CSS-pixel barrier gap");
    }
  }
});

function assertBehind(y, halfHeight, rowY, height, scale, sceneHeight, offset) {
  const barrierTop = rowY * height / sceneHeight - offset - 28;
  const carFrontWithShadow = y * height / sceneHeight + halfHeight + 5;
  assert.ok((barrierTop - carFrontWithShadow) * scale >= 14 - 1e-7, "Whole vehicle and shadow must stop at least 14 CSS pixels before barrier");
}

test("Chicken Dash clamps all overlapping vehicle sizes behind barriers at desktop/mobile scales", () => {
  for (const view of views) for (const [type, [, height]] of Object.entries(dash.CAR_DIMS)) {
    const v = dash.newVis([1.01, 1.06]);
    v.traffic.forEach((cars) => { cars.length = 0; });
    v.nextSpawn.fill(Infinity);
    v.passed[1] = true;
    const car = { type, y: (dash.ROW_Y * view.h / dash.H - 70) * dash.H / view.h, speed: 210, dir: 1 };
    v.traffic[1].push(car);
    for (let frame = 0; frame < 100; frame++) {
      dash.update(v, 16, frame * 16, view);
      assertBehind(car.y, height / 2, dash.ROW_Y, view.h, view.scale, dash.H, 70);
    }
    assert.equal(v.traffic[1].length, 1, "Stopped traffic stays visible");
  }
});

test("Chicken Dash approaching traffic cannot overshoot and fully passed traffic keeps moving", () => {
  const view = views[0], v = dash.newVis([1.01, 1.06]);
  v.nextSpawn.fill(Infinity);
  const approaching = { type: "truck", y: -120, speed: 210, dir: 1 };
  const departed = { type: "sedan", y: 330, speed: 120, dir: 1 };
  v.traffic[1] = [approaching, departed]; v.passed[1] = true;
  dash.update(v, 2000, 2000, view);
  assertBehind(approaching.y, 64, dash.ROW_Y, view.h, view.scale, dash.H, 70);
  assert.ok(departed.y > 330);
});

test("Chicken Road parks upstream/overlapping cars behind barriers and clears departed cars naturally", () => {
  for (const view of views) for (const [type, { h: height }] of Object.entries(road.CAR_SPEC)) {
    const v = road.newVis([1.01, 1.06]);
    v.moving.forEach((cars) => { cars.length = 0; });
    v.nextSpawn.fill(Infinity);
    const barrierY = road.MANHOLE_Y * view.h / road.H - 72;
    v.moving[1] = [{ type, y: barrierY * road.H / view.h, speed: 180 }];
    road.blockLane(v, 1, view);
    assert.ok(v.parked[1]);
    assertBehind(v.parked[1].y, height / 2, road.MANHOLE_Y, view.h, view.scale, road.H, 72);
    for (let frame = 0; frame < 100; frame++) road.update(v, 16, frame * 16, view);
    assertBehind(v.parked[1].y, height / 2, road.MANHOLE_Y, view.h, view.scale, road.H, 72);
  }
  const v = road.newVis([1.01]);
  v.moving[1] = [{ type: "taxi", y: 350, speed: 150 }];
  road.blockLane(v, 1, views[0]);
  assert.equal(v.parked[1], null, "Do not freeze a departed car in front of the barrier");
  road.update(v, 100, 100, views[0]);
  assert.equal(v.moving[1][0].y, 365);
  road.update(v, 2000, 2100, views[0]);
  assert.equal(v.moving[1].length, 0);
});

test("Both games re-clamp stopped vehicles when viewport dimensions change", () => {
  const v = road.newVis([1.01]);
  v.moving[1] = [{ type: "fire", y: 130, speed: 180 }];
  road.blockLane(v, 1, views[0]);
  road.update(v, 16, 16, views[1]);
  assertBehind(v.parked[1].y, road.CAR_SPEC.fire.h / 2, road.MANHOLE_Y, views[1].h, views[1].scale, road.H, 72);
  const d = dash.newVis([1.01]);
  d.passed[1] = true; d.nextSpawn.fill(Infinity);
  d.traffic[1] = [{ type: "bus", y: 130, speed: 180, dir: 1 }];
  dash.update(d, 16, 16, views[0]);
  dash.update(d, 16, 32, views[1]);
  assertBehind(d.traffic[1][0].y, 59, dash.ROW_Y, views[1].h, views[1].scale, dash.H, 70);
});
