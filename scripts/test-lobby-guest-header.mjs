import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const jsx = (type, props) => ({ type, props });
const stubs = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : String(key) });
const code = ts.transpileModule(readFileSync("src\\components\\lobby\\Lobby.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", code)(name => {
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
  if (name === "react") return { useState: value => [value, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) };
  if (name.endsWith("i18n/client")) return {
    useI18n: () => ({ t: key => ["footerCasino", "footerSupport", "marquee"].includes(key) ? ["Announcement"] : key, locale: "en" }),
  };
  if (name === "@/lib/appInstall") return { useAppInstalled: () => true };
  if (name === "@/lib/gameCatalog") return { GAME_IMAGES: {}, GAME_ORDER: [] };
  return stubs;
}, loaded, loaded.exports);

function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => find(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate)];
}

const guest = { loggedIn: false, isAdmin: false };
const player = { loggedIn: true, isAdmin: false, name: "Player", balance: 100 };
const admin = { loggedIn: true, isAdmin: true };

test("guest top header uses the player wallet controls without Login/Register labels", () => {
  for (const viewer of [guest, player]) {
    const tree = loaded.exports.Header({ viewer });
    const links = find(tree, node => node.type === "default");
    assert.equal(links.filter(node => ["login", "register"].includes(node.props.children)).length, 0);
    const deposit = links.filter(node => ["deposit", "Deposit"].includes(node.props["aria-label"]));
    assert.equal(deposit.length, 2, "desktop and mobile both show the existing wallet control");
    assert.ok(deposit.every(node => node.props.href === (viewer.loggedIn ? "/player/deposit" : "/login")));
    assert.equal(find(tree, node => node.type === "NotificationBell")[0].props.loggedIn, viewer.loggedIn);
    assert.equal(find(tree, node => node.type === "OpenSupportButton").length, 1);
    assert.equal(find(tree, node => node.type === "Drawer")[0].props.loggedIn, viewer.loggedIn);
  }
});

test("guest announcement and auth links share a full-width mobile row below the banner", () => {
  const tree = loaded.exports.Lobby({ viewer: guest, cat: "All" });
  const register = find(tree, node => node.type === "default" && node.props.children === "register");
  const login = find(tree, node => node.type === "default" && node.props.children === "login");
  assert.equal(register.length, 1);
  assert.equal(login.length, 1);
  assert.equal(register[0].props.href, "/signup");
  assert.equal(login[0].props.href, "/login");
  const rows = find(tree, node => node.type === "section" &&
    find(node, child => child.type === "Marquee").length > 0 &&
    find(node, child => child.props?.children === "register").length > 0);
  assert.equal(rows.length, 1);
  assert.match(rows[0].props.className, /flex-row/);
  assert.match(rows[0].props.className, /max-md:order-1 max-md:col-span-2/);
  const marquee = find(rows[0], node => node.type === "div" && node.props.children?.type === "Marquee")[0];
  assert.doesNotMatch(marquee.props.className, /\bhidden\b/);
  assert.equal(find(tree, node => node.type === "Marquee").length, 1, "guest announcement must not be duplicated on mobile");
});

test("signed-in player and admin lobby controls remain unchanged", () => {
  const tree = loaded.exports.Lobby({ viewer: player, cat: "All" });
  assert.equal(find(tree, node => node.type === "Marquee").length, 2, "player keeps the existing separate mobile announcement");
  assert.equal(find(tree, node => typeof node.type === "function" && node.type.name === "MobileUserCard").length, 1);
  assert.equal(find(tree, node => ["login", "register"].includes(node.props?.children)).length, 0);
  const header = loaded.exports.Header({ viewer: admin });
  assert.equal(find(header, node => node.props?.children === "adminPanel").length, 1);
  assert.equal(find(header, node => node.props?.["aria-label"] === "Admin panel").length, 1);
});
