import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("src\\app\\admin\\transactions\\Client.tsx", "utf8");
const flatten = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(flatten) : [node, ...flatten(node.props?.children)];
function harness(type = "deposit") {
  const slots = [], urls = [], pushes = [], effects = [];
  let cursor = 0, loader, result = { status: "", rows: ["pending", "approved", "rejected"].map((status, i) => ({
    _id: `payment-${i}`, type, status, userId: { name: status, phone: "fixture" }, amount: 10, provider: "jazzcash",
    createdAt: new Date().toISOString(), proofImage: "data:image/png;base64,fixture", slipImage: "https://example.test/slip.png",
  })) };
  const jsx = (type, props, key) => ({ type, props, key });
  const imports = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState: initial => { const slot = cursor++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], value => { slots[slot] = value; }]; },
      useEffect: callback => { effects.push(callback); },
    },
    "next/link": { default: () => {} },
    "next/navigation": { useRouter: () => ({ push: url => pushes.push(url) }) },
    "react-dom": { createPortal: node => node },
    "@/components/Shell": { Card: () => {}, ProviderBadge: () => {}, StatusBadge: () => {}, fmt: String, fmtDate: String },
    "@/lib/clientActions": {}, "@/lib/imageFile": {}, "@/lib/adminLiveUpdates": {},
    "@/lib/useDb": { useDb: callback => { loader = callback; return { data: result, error: null, reload: () => {} }; } },
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports);
  const view = loaded.exports.default({ type, searchParams: { q: "fixture", days: "7" } });
  return {
    render: () => { cursor = 0; return flatten(view.type(view.props)); },
    urls, pushes, effects,
    loader: () => loader,
    replaceResult: data => { result = data; },
    preview: node => { cursor = 5; return flatten(node.type(node.props)); },
  };
}

for (const type of ["deposit", "withdraw"]) {
  test(`${type} tabs update immediately, keep the page mounted and retain search filters`, async () => {
    const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
    const h = harness(type);
    globalThis.window = { history: { replaceState: (_, __, url) => h.urls.push(url) } };
    const requests = [];
    globalThis.fetch = async (url, options) => { requests.push({ url, options }); return Response.json({ rows: [] }); };
    try {
      const nodes = h.render();
      assert.equal(nodes.filter(node => node.type === "tr").length, 4);
      for (const [label, status] of [["Pending", "pending"], ["Approved", "approved"], ["Rejected", "rejected"], ["All", ""]]) {
        h.render().find(node => node.type === "button" && node.props.children === label).props.onClick();
        const next = h.render();
        assert.equal(next.find(node => node.type === "button" && node.props.children === label).props["aria-pressed"], true);
        assert.equal(next.filter(node => node.type === "tr").length, status ? 2 : 4);
        const signal = new AbortController().signal;
        await h.loader()(signal);
        const request = requests.at(-1);
        const url = new URL(request.url, "http://localhost");
        assert.equal(url.searchParams.get("status") ?? "", status);
        assert.equal(url.searchParams.get("q"), "fixture");
        assert.equal(url.searchParams.get("days"), "7");
        assert.equal(request.options.signal, signal);
        assert.ok(next.some(node => node.type === "form"), "search remains mounted");
      }
      assert.equal(h.urls.length, 4);
      assert.equal(h.pushes.length, 0, "tabs never trigger route navigation");
    } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
  });
}

test("embedded screenshot and URL slips open in an in-page dialog with visible image errors", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { body: {} };
  try {
    const h = harness();
    h.render().find(node => node.type === "button" && node.props.children === "Open payment screenshot").props.onClick();
    let preview = h.render().find(node => node.type?.name === "PaymentPreview");
    assert.equal(preview.props.src, "data:image/png;base64,fixture");
    const nodes = h.preview(preview);
    assert.ok(nodes.some(node => node.props?.role === "dialog"));
    const image = nodes.find(node => node.type === "img");
    assert.equal(image.props.src, preview.props.src);
    image.props.onError();
    assert.ok(h.preview(preview).some(node => node.props?.role === "alert"));
    nodes.find(node => node.type === "button" && node.props.children === "Close").props.onClick();
    assert.ok(!h.render().some(node => node.type?.name === "PaymentPreview"));
    h.render().find(node => node.type === "button" && node.props.children === "View slip").props.onClick();
    preview = h.render().find(node => node.type?.name === "PaymentPreview");
    assert.equal(preview.props.src, "https://example.test/slip.png");
    assert.doesNotMatch(source, /href=\{t\.(proofImage|slipImage)\}/);
  } finally { globalThis.document = previousDocument; }
});
