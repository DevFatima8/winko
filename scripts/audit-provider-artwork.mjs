import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import ts from "typescript";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

function load(file, imports = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const images = load("src\\lib\\gameCatalog.ts");
const { providerArtwork } = load("src\\lib\\providerArtwork.ts", { "./gameCatalog": images });
const { providerCategory } = load("src\\lib\\providerCategories.ts");
const { getGregmornCatalog } = load("src\\lib\\gregmorn.ts", { "node:crypto": { createHmac, timingSafeEqual } });
const games = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : await getGregmornCatalog();
if (!Array.isArray(games) || !games.length) throw new Error("Cannot audit an empty or invalid catalogue.");
const all = games.map(game => ({
  ...game,
  localArtwork: providerArtwork(game.title, game.imageUrl),
  lobbyCategory: providerCategory(game) ?? "Unassigned",
}));
const missing = all.filter(game => !game.localArtwork.startsWith("/"));
const matched = all.filter(game => game.localArtwork.startsWith("/"));
for (const game of matched) {
  if (!existsSync(join("public", ...game.localArtwork.split("/").filter(Boolean)))) throw new Error(`Missing mapped file: ${game.localArtwork}`);
}
const mapped = new Set(Object.values(images.GAME_IMAGES));
const unindexed = readdirSync("public\\games").filter(file => /\.(png|jpe?g|webp|avif)$/i.test(file) && !mapped.has(`/games/${file}`));
const csv = rows => rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
const sorted = rows => rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.title.localeCompare(b.title));
mkdirSync("docs", { recursive: true });
writeFileSync("docs\\provider-missing-artwork.csv", csv([
  ["Game title", "Provider", "Website category", "Provider category", "Suggested filename", "Game ID"],
  ...sorted(missing).map(game => [
    game.title, game.provider, game.lobbyCategory, game.category ?? "",
    `${game.provider}-${game.title}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".jpg",
    game.id,
  ]),
]));
writeFileSync("docs\\provider-matched-artwork.csv", csv([
  ["Game title", "Provider", "Website category", "Local artwork"],
  ...sorted(matched).map(game => [game.title, game.provider, game.lobbyCategory, game.localArtwork]),
]));
console.log(JSON.stringify({
  games: all.length, matched: matched.length, missing: missing.length,
  categories: all.reduce((counts, game) => { counts[game.lobbyCategory] = (counts[game.lobbyCategory] ?? 0) + 1; return counts; }, {}),
  unindexedPublicGameImages: unindexed,
}, null, 2));
