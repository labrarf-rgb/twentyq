// npm run kb:bench:players: play held-out answer sheets through the real engine (SPECS 11.5).
// Reports win by turn 20 and 25, per thing and overall, and repeat play (game 1 against game 3)
// against an in-memory game log. Options: --seeds N (default 6), --sheet name.txt, --set key=value,...
import { loadKB } from "./lib/kb-io";
import { avgWin, loadSheets, pct, rate, runPlayerBench, unknownQuestionIds } from "./lib/playerbench";
import type { EngineConstants } from "../src/engine/types";

const argv = process.argv;
const arg = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const SEEDS = Number(arg("--seeds") ?? 6);
const only = arg("--sheet");
const constants: Partial<EngineConstants> = {};
for (const kv of (arg("--set") ?? "").split(",").filter(Boolean)) {
  const [k, v] = kv.split("=");
  (constants as Record<string, number>)[k] = Number(v);
}

const kb = loadKB();
let rows = loadSheets();
if (only) rows = rows.filter((r) => r.sheet === only);
if (!rows.length) {
  console.error("no sheet rows found in kb/player-sheets/");
  process.exit(1);
}
const bad = unknownQuestionIds(kb, rows);
if (bad.length) {
  console.error("sheet question ids that are not in the KB (they would silently count as No):\n  " + bad.join("\n  "));
  process.exit(1);
}

const t0 = Date.now();
const res = runPlayerBench(kb, rows, { seeds: SEEDS, repeats: 3, constants });
const e = { ...kb.engine, ...constants };
console.log(`\n${kb.kbVersion}: ${kb.things.length} things, ${rows.length} sheet rows x ${SEEDS} seeds x 3 games (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`constants: guessConfidence ${e.guessConfidence}, guessMinTurn ${e.guessMinTurn}, topK ${e.topK}, learnPriorStrength ${e.learnPriorStrength ?? "(default 2)"}`);
if (res.notInKb.length) console.log(`not in the KB (certain stumps until taught): ${res.notInKb.join(", ")}`);

const show = (label: string, ts: typeof res.isolated) => {
  console.log(`\n${label}`);
  ts.forEach((t, g) => console.log(`  game ${g + 1}: won by turn 20 ${pct(rate(t, "by20")).padStart(6)}   by turn 25 ${pct(rate(t, "by25")).padStart(6)}   avg win turn ${avgWin(t).toFixed(1)}   (${t.games} games)`));
};
show("Repeat play, each thing on its own log (what one extra game of the same thing is worth)", res.isolated);
show("Repeat play, all things on one shared log, round-robin (closer to a real device)", res.shared);

console.log("\nPer thing, won by turn 20 out of " + SEEDS + " (isolated log): game 1 / game 2 / game 3");
const sorted = [...res.perRow].sort((a, b) => a.wins20[0] - b.wins20[0] || a.id.localeCompare(b.id));
for (const r of sorted) console.log(`  ${r.id.padEnd(22)} ${r.wins20.map((w) => String(w).padStart(2)).join(" / ")}${r.inKb ? "" : "   (not in KB)"}`);
