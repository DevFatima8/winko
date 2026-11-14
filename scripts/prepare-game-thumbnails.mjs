import { mkdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const source = await readFile(path.join("src", "lib", "gameCatalog.ts"), "utf8");
const catalog = {};
new Function("exports", ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(catalog);
await mkdir(path.join("public", "games", "thumbnails"), { recursive: true });
let originalBytes = 0, thumbnailBytes = 0;
for (const slug of catalog.GAME_ORDER) {
  const original = path.join("public", ...catalog.GAME_IMAGES[slug].split("/").filter(Boolean));
  const output = path.join("public", "games", "thumbnails", `${slug}.webp`);
  const result = await sharp(original).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 72, effort: 5 }).toFile(output);
  originalBytes += (await stat(original)).size;
  thumbnailBytes += result.size;
}
console.log(`${catalog.GAME_ORDER.length} thumbnails: ${originalBytes} -> ${thumbnailBytes} bytes (${(100 * (1 - thumbnailBytes / originalBytes)).toFixed(1)}% smaller). Originals preserved.`);
