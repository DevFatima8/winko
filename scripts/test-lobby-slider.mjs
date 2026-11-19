import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import * as react from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const code = ts.transpileModule(readFileSync("src\\components\\lobby\\HotSlider.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", code)(name => {
  if (name === "react") return react;
  assert.equal(name, "react/jsx-runtime");
  return jsxRuntime;
}, loaded, loaded.exports);

for (const [hotCount, restCount] of [[2, 4], [3, 5], [6, 3], [0, 4], [4, 0]]) {
  test(`lobby slider packs ${hotCount} hot and ${restCount} other games without blank slots`, () => {
    const cards = (prefix, count) => Array.from({ length: count }, (_, i) =>
      createElement("div", { key: `${prefix}-${i}`, "data-game": `${prefix}-${i}`, className: "snap-start" }, `${prefix}-${i}`),
    );
    const markup = renderToStaticMarkup(createElement(loaded.exports.HotSlider, {
      hot: cards("hot", hotCount), rest: cards("rest", restCount), onPhase() {},
    }));
    const ids = [...markup.matchAll(/data-game="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ids, [
      ...Array.from({ length: hotCount }, (_, i) => `hot-${i}`),
      ...Array.from({ length: restCount }, (_, i) => `rest-${i}`),
    ]);
    assert.doesNotMatch(markup, /aria-hidden|row-start-1/);
    assert.equal((markup.match(/<div/g) ?? []).length, hotCount + restCount + 3 + Number(restCount > 0));
    assert.match(markup, /grid-flow-col grid-rows-3/);
    assert.match(markup, /aria-label="Previous games"/);
    assert.match(markup, /aria-label="Next games"/);
  });
}
