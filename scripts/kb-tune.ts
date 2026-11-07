// npm run kb:tune: grid over the guess constants on the player bench (SPECS 11.5).
//   tsx scripts/kb-tune.ts --conf 0.4,0.5 --min 5,6 --topk 1,2 [--k 1,2,3,4] [--first-only] [--seeds 10]
// It prints every cell; it never edits kb.json. Pick from a plateau, then confirm with the full kb:bench.
import { fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { loadKB } from "./lib/kb-io";
import { loadSheets, pct, rate, runPlayerBench, type PlayerBenchResult } from "./lib/playerbench";

const argv = process.argv;
const arg = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const list = (n: string, d: string) => (arg(n) ?? d).split(",").map(Number);
const SEEDS = Number(arg("--seeds") ?? 10);
const FIRST = argv.includes("--first-only");

interface Cell {
  guessConfidence: number;
  guessMinTurn: number;
  topK: number;
  learnPriorStrength: number;
}
interface Row extends Cell {
  g1_20: number;
  g1_25: number;
  g3_20?: number;
  g3_25?: number;
  g3s_20?: number;
  g2_20?: number;
}

function evaluate(c: Cell): Row {
  const res: PlayerBenchResult = runPlayerBench(loadKB(), loadSheets(), { seeds: SEEDS, repeats: 3, constants: c, firstOnly: FIRST });
  const row: Row = { ...c, g1_20: rate(res.isolated[0], "by20"), g1_25: rate(res.isolated[0], "by25") };
  if (!FIRST) {
    row.g2_20 = rate(res.isolated[1], "by20");
    row.g3_20 = rate(res.isolated[2], "by20");
    row.g3_25 = rate(res.isolated[2], "by25");
    row.g3s_20 = rate(res.shared[2], "by20");
  }
  return row;
}

const wi = argv.indexOf("--worker");
if (wi >= 0) {
  const row = evaluate(JSON.parse(argv[wi + 1]));
  process.send!(row, undefined, undefined, () => process.exit(0));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cells: Cell[] = [];
  for (const guessConfidence of list("--conf", "0.8"))
    for (const guessMinTurn of list("--min", "8"))
      for (const topK of list("--topk", "3"))
        for (const learnPriorStrength of list("--k", "2")) cells.push({ guessConfidence, guessMinTurn, topK, learnPriorStrength });
  const pool = Math.max(1, availableParallelism() - 1);
  const rows: Row[] = [];
  let next = 0;
  const t0 = Date.now();
  let done = 0;
  const run = () =>
    new Promise<void>((resolve, reject) => {
      const lane = () => {
        if (next >= cells.length) return;
        const cell = cells[next++];
        const child = fork(fileURLToPath(import.meta.url), ["--seeds", String(SEEDS), ...(FIRST ? ["--first-only"] : []), "--worker", JSON.stringify(cell)], { execArgv: process.execArgv });
        child.on("message", (m) => rows.push(m as Row));
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code !== 0) return reject(new Error(`worker exited ${code}`));
          if (++done === cells.length) resolve();
          else lane();
        });
      };
      for (let i = 0; i < Math.min(pool, cells.length); i++) lane();
    });
  void run().then(() => {
    rows.sort((a, b) => b.g1_20 - a.g1_20 || (b.g3_20 ?? 0) - (a.g3_20 ?? 0));
    console.log(`\n${cells.length} cells x ${SEEDS} seeds (${((Date.now() - t0) / 1000).toFixed(0)}s). game 1 = no learning; game 3 = after two games of the same thing\n`);
    console.log("conf  minT topK  K | g1 by20  by25 |" + (FIRST ? "" : " g2 by20 | g3 by20  by25 | shared g3 by20"));
    for (const r of rows)
      console.log(
        `${r.guessConfidence.toFixed(2)}  ${String(r.guessMinTurn).padStart(4)} ${String(r.topK).padStart(4)} ${String(r.learnPriorStrength).padStart(2)} | ${pct(r.g1_20).padStart(7)} ${pct(r.g1_25).padStart(6)} |` +
          (FIRST ? "" : ` ${pct(r.g2_20!).padStart(7)} | ${pct(r.g3_20!).padStart(7)} ${pct(r.g3_25!).padStart(6)} | ${pct(r.g3s_20!).padStart(7)}`),
      );
  });
}
