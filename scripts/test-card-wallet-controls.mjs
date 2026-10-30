import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve("src", "components");
const cardDirectories = [
  "32-cards", "amar-akbar-anthony", "baccarat", "blackjack",
  "bollywood-casino", "casino-war", "football-studio", "monster-hilo",
  "muflis", "poker", "poker-betting", "red-vs-black", "rummy",
  "speed-baccarat", "teen-patti", "teen-patti-999", "teen-patti-ak47",
  "teen-patti-best-of-four", "teen-patti-faceoff", "teen-patti-hukam",
  "teen-patti-joker", "texas-holdem", "three-card-poker", "three-cards",
];
const read = (file) => readFileSync(path.join(root, ...file.split("/")), "utf8");
const sources = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory()
    ? sources(path.join(directory, entry.name))
    : entry.name.endsWith(".tsx") ? [path.join(directory, entry.name)] : []);

test("card tables have no free-credit/reset-wallet controls or associated handlers", () => {
  const forbidden = /\b(?:resetBalance|resetDemo|resetGame|resetAll|topUp|takeBonus|addChips|onAddChips|onRequestChips)\b|(?:const|function)\s+rebuy\b|reset\s+(?:balance|bankroll|credits)|free\s+(?:chips|credits|bonus)|top[\s-]?up|add\s+credits/i;
  for (const directory of cardDirectories) {
    for (const file of sources(path.join(root, directory))) {
      assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, file);
    }
  }
});

test("removed wallet controls leave card components syntactically valid", () => {
  for (const directory of cardDirectories) {
    for (const file of sources(path.join(root, directory))) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      assert.equal(source.parseDiagnostics.length, 0, file);
    }
  }
});

test("legitimate round restarts, wallet bets, refunds and stats reset remain", () => {
  assert.match(read("muflis/MuflisGame.tsx"), /onPlayAgain=\{nextRound\}/);
  assert.doesNotMatch(read("blackjack/BlackjackGame.tsx"), /\bresetSession\b|\bsetCredits\b/);
  assert.match(read("muflis/MuflisGame.tsx"), /pool\.start\(wager\)/);
  assert.match(read("poker/PokerGame.tsx"), /const nextRound =/);
  assert.match(read("poker-betting/components/PokerGame.tsx"), /const nextRound =/);
  assert.match(read("casino-war/CasinoWar.tsx"), /onPlayAgain=\{clearBets\}/);
  assert.match(read("casino-war/CasinoWar.tsx"), /await pool\.refund\(\)/);
  assert.match(read("three-card-poker/ThreeCardPoker.tsx"), /await pool\.refund\(\)/);
  assert.match(read("three-cards/Game.tsx"), /pool\.start\(bet, \(\) => setBalance\(\(b\) => b - bet\)\)/);
  assert.match(read("teen-patti-999/TeenPatti999.tsx"), /onClick=\{\(\) => setStats\(DEFAULT_STATS\)\}/);
  assert.match(read("speed-baccarat/SpeedBaccaratGame.tsx"), /const resetSession = \(\) => \{ setStats\(EMPTY_STATS\); \}/);
  assert.match(read("texas-holdem/Game.tsx"), /const \[walletBalance\] = useGameBalance\("texas-holdem", 0\)/);
});
