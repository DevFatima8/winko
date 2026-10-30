import { readFileSync, writeFileSync } from "node:fs";
export function patch(path, pairs) {
  let text = readFileSync(path, "utf8");
  const crlf = text.includes("\r\n");
  for (let [oldS, newS] of pairs) {
    if (crlf) { oldS = oldS.replace(/\r?\n/g, "\r\n"); newS = newS.replace(/\r?\n/g, "\r\n"); }
    const n = text.split(oldS).length - 1;
    if (n !== 1) throw new Error(`${path}: expected 1 match, found ${n} for:\n${oldS.slice(0, 300)}`);
    const i = text.indexOf(oldS);
    text = text.slice(0, i) + newS + text.slice(i + oldS.length);
  }
  writeFileSync(path, text);
  console.log("patched", path, pairs.length, crlf ? "crlf" : "lf");
}
