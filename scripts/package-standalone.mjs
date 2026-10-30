// Assembles a self-contained deploy folder for Hostinger: .next/standalone plus the
// static assets and public files Next's standalone output does not copy automatically.
// Run `npm run build` first, then `node scripts/package-standalone.mjs`, then zip
// the contents of `deploy/` (not the project root) and upload that to Hostinger.
import { cpSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const standalone = path.join(root, ".next", "standalone");
const deployDir = path.join(root, "deploy");

if (!existsSync(standalone)) {
    console.error("Missing .next/standalone. Run `npm run build` first.");
    process.exit(1);
}

rmSync(deployDir, { recursive: true, force: true });
mkdirSync(deployDir, { recursive: true });
cpSync(standalone, deployDir, { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(deployDir, ".next", "static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(deployDir, "public"), { recursive: true });

import { execSync } from "node:child_process";
console.log("Installing missing database driver (mysql2) into the deploy folder...");
cpSync(path.join(root, "package.json"), path.join(deployDir, "package.json"));
execSync("npm install mysql2 --no-save", { cwd: deployDir, stdio: "inherit" });

console.log(`\nDeploy folder ready at: ${deployDir}`);
console.log("Zip the contents of that folder and upload to Hostinger.");
console.log("On the server: set the Node.js app entry point to server.js and start with `node server.js` (no npm install needed).");
