import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const nativeRequire = createRequire(import.meta.url);
const modules = new Map();
function load(file) {
  const filename = path.resolve(root, file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const require = id => {
    if (!id.startsWith(".") && !id.startsWith("@/")) return nativeRequire(id);
    const target = id.startsWith("@/")
      ? path.resolve(root, "src", id.slice(2))
      : path.resolve(path.dirname(filename), id);
    const resolved = [target, `${target}.ts`, path.join(target, "index.ts")].find(existsSync);
    assert.ok(resolved, `Cannot load ${id} from ${filename}`);
    return load(resolved);
  };
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", compiled)(require, loaded, loaded.exports);
  return loaded.exports;
}

const server = load("src\\lib\\browserSlotOutcome.ts");
const { readBrowserSlotOutcome } = load("src\\lib\\browserSlotTypes.ts");
const { readSlotPresentation, saveSlotPresentation } = load("src\\lib\\browserSlotPresentation.ts");
const ox = load("src\\components\\fortune-ox\\lib\\fortuneOx.ts");
const gems = load("src\\components\\fortune-gems\\game\\logic.ts");
const toucan = load("src\\components\\fortune-toucan\\lib\\fortune.ts");
const gates = load("src\\components\\gates-of-olympus\\game\\engine.ts");
const diao = load("src\\components\\diao-chan\\game\\engine.ts");
const money = amount => Math.round(amount * 100) / 100;
const tx = () => {
  const rows = new Map();
  return {
    rows,
    async get(collection, id) { return structuredClone(rows.get(`${collection}:${id}`)); },
    async put(collection, id, row) { rows.set(`${collection}:${id}`, structuredClone(row)); },
  };
};
const selection = (game, stake) => game === "fortune-gems" ? { extra: false, baseBet: stake } : {};

test("Diao Chan engine parses as a Next.js module with top-level server preparation exports", async () => {
  const { loadBindings } = nativeRequire("next/dist/build/swc");
  const filename = path.resolve(root, "src", "components", "diao-chan", "game", "engine.ts");
  const bindings = await loadBindings();
  const parsed = await bindings.parse(readFileSync(filename, "utf8"), {
    filename, syntax: "typescript", tsx: false,
  });
  const ast = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  assert.equal(ast.type, "Module");
  const exports = ast.body.filter(node => node.type === "ExportDeclaration")
    .map(node => node.declaration?.identifier?.value);
  assert.ok(exports.includes("prepareServerSpin"));
  assert.ok(exports.includes("prepareServerSequence"));
});

for (const game of server.SERVER_BROWSER_SLOT_GAMES) {
  test(`${game}: ten natural winners per 100 distinct players; repeats lose without consuming a slot`, async () => {
    const store = tx();
    const stake = 100000;
    let winners = 0;
    for (let player = 0; player < 100; player++) {
      const result = await server.serverSlotOutcome(store, `player-${player}`, game, stake, selection(game, stake));
      assert.equal(result.claim, result.outcome.payout);
      assert.ok(readBrowserSlotOutcome(game, result.outcome, stake));
      assert.ok(result.claim >= 0 && result.claim <= stake * 2);
      winners += result.claim > 0 ? 1 : 0;
      if (player < 99) {
        const cycle = structuredClone(store.rows.get(`multiplayerrooms:${game}:ten-player-wins:v1`));
        const repeat = await server.serverSlotOutcome(store, `player-${player}`, game, stake, selection(game, stake));
        assert.equal(repeat.claim, 0);
        assert.deepEqual(store.rows.get(`multiplayerrooms:${game}:ten-player-wins:v1`), cycle);
      }
    }
    assert.equal(winners, 10);
    assert.equal(store.rows.get(`multiplayerrooms:${game}:ten-player-wins:v1`).players.length, 0);
  });

  test(`${game}: invalid selection cannot consume a player slot; forged visible result is rejected`, async () => {
    const store = tx();
    for (const invalid of [null, [], { payout: 400000 }, { grid: [] }, { extra: true, baseBet: 1 }]) {
      await assert.rejects(server.serverSlotOutcome(store, "alice", game, 100000, invalid), server.BrowserSlotSelectionError);
      assert.equal(store.rows.size, 0);
    }
    const result = await server.serverSlotOutcome(store, "alice", game, 100000, selection(game, 100000));
    const forged = structuredClone(result.outcome);
    forged.payout = 400000;
    assert.equal(readBrowserSlotOutcome(game, forged, 100000), null);
    const broken = structuredClone(result.outcome);
    const spin = broken.spin ?? broken.spins[0];
    spin.grid = ["not-a-symbol"];
    assert.equal(readBrowserSlotOutcome(game, broken, 100000), null);
    assert.equal(readBrowserSlotOutcome(game, result.outcome, 10), null);
  });
}

test("pure engines: both outcomes remain reel-supported at cent stakes and at 100000", () => {
  for (const stake of [10, 10.01, 30.15, 100000]) {
    for (const won of [false, true]) {
      for (let sample = 0; sample < 30; sample++) {
        const oxSpin = ox.prepareServerSpin(stake, won);
        assert.ok(readBrowserSlotOutcome("fortune-ox", { game: "fortune-ox", stake, spin: oxSpin, payout: oxSpin.total }, stake));
        const toucanSpin = toucan.prepareServerSpin(stake, won);
        assert.ok(readBrowserSlotOutcome("fortune-toucan", { game: "fortune-toucan", stake, spin: toucanSpin, payout: toucanSpin.totalWin }, stake));
        for (const extra of [false, true]) {
          const paid = money(stake * (extra ? 1.5 : 1));
          const spin = gems.prepareServerSpin(extra, won, stake);
          assert.ok(readBrowserSlotOutcome("fortune-gems", {
            game: "fortune-gems", stake: paid, extra, baseBet: stake, spin, payout: money(spin.payMultiplier * stake),
          }, paid));
        }
        const spins = gates.prepareServerSequence(stake, won);
        assert.ok(readBrowserSlotOutcome("gates-of-olympus", {
          game: "gates-of-olympus", stake, spins, payout: money(spins.reduce((sum, spin) => sum + spin.amount, 0)),
        }, stake));
        const sequence = diao.prepareServerSequence(stake, won);
        const free = sequence.singleMode ? sequence.freeModes[sequence.singleMode] : [];
        assert.ok(readBrowserSlotOutcome("diao-chan", {
          game: "diao-chan", stake, ...sequence, payout: money(sequence.spin.totalWin + free.reduce((sum, spin) => sum + spin.totalWin, 0)),
        }, stake));
      }
    }
  }
});

test("prepared bonuses are complete, capped, and cannot change via a client award", () => {
  let toucanFeatures = 0, gatesFeatures = 0, diaoChoices = 0, diaoSingles = 0;
  for (let sample = 0; sample < 300; sample++) {
    const stake = 100000;
    if (toucan.prepareServerSpin(stake, true).type === "feature") toucanFeatures++;
    const gatesSpins = gates.prepareServerSequence(stake, true);
    if (gatesSpins.length > 1) {
      gatesFeatures++;
      assert.equal(gatesSpins.length, 7);
      assert.equal(gatesSpins[0].grid.filter(cell => cell.symbol === "bolt").length, 4);
      assert.equal(gatesSpins.slice(1).filter(spin => spin.amount > 0).length, 1);
      assert.ok(gatesSpins.reduce((sum, spin) => sum + spin.amount, 0) <= stake * 2);
    }
    const sequence = diao.prepareServerSequence(stake, true);
    if (sequence.singleMode) {
      diaoSingles++;
      assert.equal(sequence.spin.scatterCount, 2);
      assert.equal(sequence.freeModes[sequence.singleMode].length, 1);
    } else if (sequence.spin.scatterCount >= 3) {
      diaoChoices++;
      assert.equal(sequence.spin.totalWin, stake * 2);
      for (const [mode, count] of [["diaochan", 8], ["dongzhuo", 10], ["lubu", 12]]) {
        assert.equal(sequence.freeModes[mode].length, count);
        assert.equal(sequence.freeModes[mode].reduce((sum, spin) => sum + spin.totalWin, 0), 0);
      }
    }
  }
  assert.ok(toucanFeatures > 0 && gatesFeatures > 0 && diaoChoices > 0 && diaoSingles > 0);
});

test("client paid spins use resolveServer, not local reel draws or arbitrary claim completion", () => {
  for (const file of [
    "src\\components\\fortune-ox\\FortuneOxGame.tsx",
    "src\\components\\fortune-gems\\FortuneGemsGame.tsx",
    "src\\components\\fortune-toucan\\FortuneToucanGame.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /pool\.start\(/);
    assert.match(source, /pool\.resolveServer\(/);
    assert.match(source, /readBrowserSlotOutcome/);
    assert.doesNotMatch(source, /pool\.(complete|award|plan|queue)\(/);
  }
  const diaoSource = readFileSync("src\\components\\diao-chan\\components\\GameScreen.tsx", "utf8");
  assert.match(diaoSource, /pool\.resolveServer\(/);
  assert.match(diaoSource, /!verified && effectiveWin > 0 && !await pool\.award/);
  assert.match(diaoSource, /outcome\?\.freeModes\[f\.mode\]/);
  const gatesSource = readFileSync("src\\components\\gates-of-olympus\\GatesOfOlympusGame.tsx", "utf8");
  assert.match(gatesSource, /pool\.resolveServer\(/);
  assert.match(gatesSource, /legacy && amount > 0 && !await pool\.award/);
  assert.match(gatesSource, /const legacy = isFree && !prepared && legacyFreeSpins > 0/);
});

test("settled bonus presentation survives navigation, rejects corruption, and never settles money again", () => {
  const storage = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  try {
    const stake = 100000;
    const spins = [gates.prepareServerSpin(stake, true)];
    const outcome = { game: "gates-of-olympus", stake, spins, payout: spins[0].amount };
    localStorage.setItem("wx:browser-active:gates-of-olympus:main:owner", "alice");
    saveSlotPresentation("gates-of-olympus", { outcome, cursor: 0 });
    assert.deepEqual(readSlotPresentation("gates-of-olympus"), {
      outcome: JSON.parse(JSON.stringify(outcome)), cursor: 0, mode: undefined,
    });
    localStorage.setItem("wx:browser-active:gates-of-olympus:main:owner", "bob");
    assert.equal(readSlotPresentation("gates-of-olympus"), null);
    localStorage.setItem("wx:browser-active:gates-of-olympus:main:owner", "alice");
    const corrupted = JSON.parse(localStorage.getItem("wx:slot-presentation:gates-of-olympus"));
    corrupted.outcome.payout = 400000;
    localStorage.setItem("wx:slot-presentation:gates-of-olympus", JSON.stringify(corrupted));
    assert.equal(readSlotPresentation("gates-of-olympus"), null);
    saveSlotPresentation("gates-of-olympus", null);
    assert.equal(readSlotPresentation("gates-of-olympus"), null);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
