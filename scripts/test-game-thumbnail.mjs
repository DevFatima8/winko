import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function harness() {
  let result = null;
  const code = ts.transpileModule(readFileSync("src\\components\\lobby\\GameThumbnail.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const jsx = (type, props) => ({ type, props });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    if (name === "react") return {
      useState: () => [result, value => { result = typeof value === "function" ? value(result) : value; }],
      useCallback: fn => fn,
    };
    assert.equal(name, "react/jsx-runtime");
    return { jsx, jsxs: jsx };
  }, loaded, loaded.exports);
  return (src = "game.jpg") => loaded.exports.GameThumbnail({ src, alt: "Game", className: "existing-image-style", loading: "lazy" }).props.children;
}

test("image has a non-spinning, click-through loader until loaded", () => {
  const render = harness();
  const [image, loader] = render();
  assert.equal(image.props.loading, "lazy");
  assert.equal(image.props.className, "existing-image-style");
  assert.equal(loader.props.role, "status");
  assert.match(loader.props.className, /pointer-events-none/);
  assert.match(JSON.stringify(loader), /animate-pulse/);
  assert.doesNotMatch(JSON.stringify(loader), /animate-spin/);
  image.props.onLoad();
  assert.equal(render()[1], false);
  assert.ok(render("other.jpg")[1], "a different source starts loading again");
});

test("cached images immediately clear their loader", () => {
  const render = harness();
  render()[0].props.ref({ complete: true, naturalWidth: 500 });
  assert.equal(render()[1], false);
});

test("failed images show an explicit message instead of an endless loader", () => {
  for (const cached of [false, true]) {
    const render = harness();
    const image = render()[0];
    if (cached) image.props.ref({ complete: true, naturalWidth: 0 });
    else image.props.onError();
    const loader = render()[1];
    assert.match(loader.props["aria-label"], /image unavailable/);
    assert.doesNotMatch(JSON.stringify(loader), /animate-pulse/);
    assert.equal(loader.props.children[1].props.children, "Image unavailable");
  }
});
