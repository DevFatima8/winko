import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const jsx = (type, props, key) => ({ type, props, key });
const nodes = node => {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
};
const text = node => {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? text(node.props?.children) : String(node);
};

function fixture() {
  let cursor = 0, now = 0, nextId = 0;
  const slots = [], effects = [], timers = new Map();
  const hooks = {
    createContext: value => ({ value }),
    useContext: context => context.value,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && deps.every((value, i) => value === previous.deps[i])) return;
      previous?.cleanup?.();
      const effect = { deps };
      slots[index] = effect;
      effects.push(() => { effect.cleanup = fn(); });
    },
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src\\components\\GameOverOverlay.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", "setTimeout", "clearTimeout", code)(name => {
    if (name === "react") return hooks;
    if (name === "next/font/google") return { Great_Vibes: () => ({ className: "result-script-font" }) };
    if (name === "./GameOverOverlay.module.css") return { default: { message: "message", heading: "heading", congratulations: "congratulations", winnings: "winnings", loss: "loss", detail: "detail" } };
    assert.equal(name, "react/jsx-runtime");
    return { jsx, jsxs: jsx };
  }, loaded, loaded.exports,
  (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
  id => timers.delete(id));
  return {
    ...loaded.exports,
    render(props) {
      cursor = 0;
      const tree = loaded.exports.GameResultMessage(props);
      effects.splice(0).forEach(fn => fn());
      return tree;
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.fn();
      }
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    timers,
  };
}

for (const title of ["Congratulations! You win", "You lose", "Round complete"]) {
  test(`${title}: visible for exactly two seconds with no background or buttons`, () => {
    const f = fixture();
    const props = { title, result: "" };
    const tree = f.render(props);
    assert.match(text(tree), new RegExp(title === "Congratulations! You win" ? "Congratulations! You won" : title));
    assert.equal(tree.props.role, "status");
    assert.match(tree.props.className, /pointer-events-none/);
    assert.equal(nodes(tree).filter(node => node.type === "button").length, 0);
    for (const node of nodes(tree)) {
      assert.doesNotMatch(node.props?.className ?? "", /\bbg-|\bbackdrop-|\bborder\b|\bring-/);
      assert.notEqual(node.props?.["aria-modal"], true);
    }
    f.advance(1999);
    assert.ok(f.render(props));
    f.advance(1);
    assert.equal(f.render(props), null);
  });
}

test("rerenders do not restart the two-second timer or start a new game", () => {
  const f = fixture();
  let dismissals = 0;
  const props = { title: "You lose", result: "", onDismiss: () => dismissals++ };
  f.render(props);
  f.advance(1500);
  f.render(props);
  f.advance(500);
  assert.equal(f.render(props), null);
  assert.equal(dismissals, 1);
  f.advance(10000);
  assert.equal(dismissals, 1);
});

test("leaving the game cancels the message timer", () => {
  const f = fixture();
  let dismissals = 0;
  f.render({ title: "You lose", result: "", onDismiss: () => dismissals++ });
  f.unmount();
  assert.equal(f.timers.size, 0);
  f.advance(2000);
  assert.equal(dismissals, 0);
});

test("the game-over adapter shows win/loss text without calling game callbacks", () => {
  const f = fixture();
  let actions = 0;
  const callbacks = { onPlayAgain: () => actions++, onClose: () => actions++ };
  assert.equal(f.GameOverOverlay({ open: false, result: "You won", ...callbacks }), null);
  for (const [result, title] of [
    ["YOU WIN Rs. 100!", "Congratulations! You win"],
    ["You won this hand.", "Congratulations! You win"],
    ["No win", "You lose"],
    ["You lose", "You lose"],
    ["Daily payout pending. Provisional claim Rs. 100", "Round complete"],
    ["Push", "Round complete"],
  ]) {
    const message = f.GameOverOverlay({ open: true, result, ...callbacks });
    assert.equal(message.props.title, title);
  }
  const message = f.GameOverOverlay({ open: true, result: "No win", ...callbacks });
  f.render(message.props);
  f.advance(2000);
  assert.equal(f.render(message.props), null);
  assert.equal(actions, 0);
});

test("pending payout details remain visible without announcing a paid win", () => {
  const f = fixture();
  const message = f.GameOverOverlay({ open: true, result: "Provisional claim Rs. 100. Daily pool settlement pending." });
  const tree = f.render(message.props);
  assert.match(text(tree), /Round complete/);
  assert.match(text(tree), /Provisional claim Rs\. 100/);
  assert.doesNotMatch(text(tree), /Congratulations|You lose/);
});

test("the winning amount uses the website font below the script congratulations heading", () => {
  const f = fixture();
  const message = f.GameOverOverlay({ open: true, result: "You won this hand.", winAmount: 1234.5 });
  const tree = f.render(message.props);
  const heading = nodes(tree).find(node => node.type === "h2");
  const spans = nodes(heading).filter(node => node.type === "span");
  assert.match(spans[0].props.className, /result-script-font/);
  assert.match(spans[0].props.className, /congratulations/);
  assert.match(spans[1].props.className, /winnings/);
  assert.doesNotMatch(spans[1].props.className, /result-script-font/);
  assert.match(text(heading).replace(/\s+/g, " ").trim(), /Congratulations! You won Rs\. 1,234\.50/);
  assert.doesNotMatch(text(tree), /You won this hand/);
});

test("a loss contains no amount even if a caller supplies stake details or win props", () => {
  const f = fixture();
  const tree = f.render({
    title: "You lose", result: "Bet Rs. 500", winAmount: 500,
    children: jsx("span", { children: "Rs. 250" }),
  });
  assert.equal(text(tree).trim(), "You lose");
  assert.doesNotMatch(text(tree), /Rs\.|500|250/);
});

test("invalid amounts are never rendered as a win", () => {
  for (const winAmount of [undefined, 0, -10, NaN, Infinity]) {
    const f = fixture();
    const tree = f.render({ title: "Congratulations! You win", result: "", winAmount });
    assert.doesNotMatch(text(tree), /Rs\.|NaN|Infinity|undefined/);
  }
});

test("losses use red website text while congratulations keeps its script font", () => {
  const f = fixture();
  const loss = nodes(f.render({ title: "You lose", result: "" })).find(node => node.type === "h2");
  assert.match(loss.props.className, /\bloss\b/);
  assert.doesNotMatch(loss.props.className, /result-script-font/);
  assert.equal(loss.props.style.fontWeight, 800);
  const win = nodes(f.render({ title: "Congratulations! You win", result: "", winAmount: 200 })).find(node => node.type === "h2");
  assert.match(nodes(win).find(node => node.type === "span").props.className, /result-script-font/);
  assert.doesNotMatch(win.props.className, /\bloss\b/);
  assert.equal(win.props.style.fontWeight, 400);
  const css = readFileSync("src\\components\\GameOverOverlay.module.css", "utf8");
  assert.match(css, /\.heading\.loss\s*\{[^}]*color:\s*#ef4444/s);
  assert.match(css, /\.winnings\s*\{[^}]*font-family:\s*var\(--font-outfit\), ui-sans-serif/s);
});

test("the result has larger green congratulations, black outline and a two-second animation without a background", () => {
  const css = readFileSync("src\\components\\GameOverOverlay.module.css", "utf8");
  assert.match(css, /color:\s*#fff/);
  assert.match(css, /-webkit-text-stroke:\s*1\.5px #000/);
  assert.match(css, /paint-order:\s*stroke fill/);
  assert.match(css, /\.congratulations\s*\{[^}]*color:\s*#22c55e;[^}]*font-size:\s*clamp\(2rem, 6vw, 2\.5rem\)/s);
  assert.match(css, /animation:\s*result-message 2s/);
  assert.match(css, /0%\s*\{\s*opacity:\s*0/);
  assert.match(css, /100%\s*\{\s*opacity:\s*0/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /background/);
});

test("shared game results suppress duplicate legacy overlays inside the game frame", () => {
  const f = fixture();
  f.SharedGameResults.value = true;
  assert.equal(f.GameOverOverlay({ open: true, result: "You won", winAmount: 100 }), null);
});

test("a provisional win always includes its pending-payout explanation", () => {
  const f = fixture();
  const tree = f.render({
    title: "Congratulations! You win", winAmount: 100,
    result: "Provisional win amount. Daily pool payout pending; not credited yet.",
  });
  assert.match(text(tree), /You won Rs\. 100\.00/);
  assert.match(text(tree), /Provisional.*pending; not credited yet/);
});
