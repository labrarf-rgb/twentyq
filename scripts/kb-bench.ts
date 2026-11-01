// npm run kb:bench: self-play benchmark from SPECS §6.
// A simulated player plays 5 seeds for every thing, truthfully and with 10% noise.
import { fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { Session } from "../src/engine/engine";
import { compileKB } from "../src/engine/kb";
import { mulberry32 } from "../src/engine/rng";
import type { AnswerToken } from "../src/engine/types";
import { loadKB } from "./lib/kb-io";
import { categoryAnswer, flip, truthfulAnswer } from "./lib/player";

// Full run: every thing, 5 seeds. `--fast` (or --stride N --seeds N) plays every Nth thing with fewer
// seeds, for use between KB batches; the full run is still the one that counts (SPECS section 6).
const argv = process.argv;
const argNum = (name: string, dflt: number) => {
  const i = argv.indexOf(name);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};
const FAST = argv.includes("--fast");
const STRIDE = argNum("--stride", FAST ? 5 : 1);
const RUNS = argNum("--seeds", FAST ? 2 : 5);
const NOISE = 0.1;
const TARGET = { truthful: { rate: 0.95, byTurn: 20 }, noisy: { rate: 0.8, byTurn: 25 } };

interface GameOutcome {
  thing: number;
  pass: "truthful" | "noisy";
  won: boolean;
  turn: number;
  /** thing indices the engine guessed wrongly along the way */
  wrong: number[];
}

/** One simulated game. Pure function of (kb, thing, run, pass). */
function simulate(ckb: ReturnType<typeof compileKB>, thing: number, run: number, pass: "truthful" | "noisy"): GameOutcome {
  const seed = (thing * 7919 + run * 104729 + (pass === "noisy" ? 1299709 : 0)) | 0;
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const s = new Session(ckb, seed);
  const wrong: number[] = [];
  while (s.current) {
    const cur = s.current;
    let a: AnswerToken;
    if (cur.kind === "category") {
      // v7: category questions are answered from cv, and noise flips them like any question
      let qa = categoryAnswer(ckb, thing, cur.cat, rnd, "random");
      if (pass === "noisy" && rnd() < NOISE) qa = flip(qa, rnd);
      a = qa;
    } else if (cur.kind === "question") {
      let qa = truthfulAnswer(ckb, thing, cur.q, rnd, "random");
      if (pass === "noisy" && rnd() < NOISE) qa = flip(qa, rnd);
      a = qa;
    } else if (cur.thing === thing) a = "right";
    else {
      a = "wrong";
      wrong.push(cur.thing);
    }
    s.apply(a);
  }
  const r = s.result!;
  return { thing, pass, won: r.outcome === "win", turn: r.turn, wrong };
}

function runSlice(kbPath: string, lo: number, hi: number): GameOutcome[] {
  const ckb = compileKB(loadKB(kbPath));
  const out: GameOutcome[] = [];
  for (let t = lo; t < hi; t++) {
    if (t % STRIDE !== 0) continue;
    for (const pass of ["truthful", "noisy"] as const)
      for (let run = 0; run < RUNS; run++) out.push(simulate(ckb, t, run, pass));
  }
  return out;
}

async function main() {
  const kb = loadKB();
  const N = kb.things.length;
  const workers = Math.max(1, Math.min(availableParallelism() - 1, N));
  const per = Math.ceil(N / workers);
  const t0 = Date.now();
  const slices = await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const lo = w * per;
      const hi = Math.min(N, lo + per);
      if (lo >= hi) return Promise.resolve([] as GameOutcome[]);
      return new Promise<GameOutcome[]>((resolve, reject) => {
        const child = fork(fileURLToPath(import.meta.url), ["--worker", String(lo), String(hi), ...argv.slice(2).filter((a) => a !== "--worker")], {
          execArgv: process.execArgv,
        });
        child.on("message", (m) => resolve(m as GameOutcome[]));
        child.on("error", reject);
        child.on("exit", (c) => c !== 0 && reject(new Error(`worker exited ${c}`)));
      });
    }),
  );
  const games = slices.flat();
  report(kb, games, (Date.now() - t0) / 1000);
}

function report(kb: ReturnType<typeof loadKB>, games: GameOutcome[], secs: number) {
  const name = (i: number) => kb.things[i].id;
  const rate = (pass: "truthful" | "noisy", byTurn: number) => {
    const g = games.filter((x) => x.pass === pass);
    return g.filter((x) => x.won && x.turn <= byTurn).length / g.length;
  };
  const rt = rate("truthful", TARGET.truthful.byTurn);
  const rn = rate("noisy", TARGET.noisy.byTurn);
  const avgTurn = (pass: "truthful" | "noisy") => {
    const w = games.filter((x) => x.pass === pass && x.won);
    return w.reduce((a, x) => a + x.turn, 0) / Math.max(1, w.length);
  };
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  const ok = (v: number, t: number) => (v >= t ? "PASS" : "FAIL");

  const subset = STRIDE > 1 ? ` (every ${STRIDE}th thing)` : "";
  console.log(`\n${kb.kbVersion}: ${kb.things.length} things${subset} x ${RUNS} seeds x 2 passes = ${games.length} games (${secs.toFixed(1)}s)${STRIDE > 1 || RUNS < 5 ? "  [FAST: indicative only, run the full bench to sign off]" : ""}\n`);
  console.log(`Truthful  won by turn ${TARGET.truthful.byTurn}: ${pct(rt)}   target >= ${pct(TARGET.truthful.rate)}   ${ok(rt, TARGET.truthful.rate)}   (avg win turn ${avgTurn("truthful").toFixed(1)}, won by 25: ${pct(rate("truthful", 25))})`);
  console.log(`10% noise won by turn ${TARGET.noisy.byTurn}: ${pct(rn)}   target >= ${pct(TARGET.noisy.rate)}   ${ok(rn, TARGET.noisy.rate)}   (avg win turn ${avgTurn("noisy").toFixed(1)})`);

  // Worst things: lowest truthful rate, then lowest noisy rate.
  const played = new Set(games.map((g) => g.thing));
  const per = kb.things.flatMap((_, i) => {
    if (!played.has(i)) return [];
    const t = games.filter((x) => x.thing === i && x.pass === "truthful");
    const n = games.filter((x) => x.thing === i && x.pass === "noisy");
    return [
      {
        id: name(i),
        truthful: t.filter((x) => x.won && x.turn <= 20).length / t.length,
        noisy: n.filter((x) => x.won && x.turn <= 25).length / n.length,
        avgTurn: t.reduce((a, x) => a + x.turn, 0) / t.length,
      },
    ];
  });
  const worst = [...per].sort((a, b) => a.truthful - b.truthful || a.noisy - b.noisy || b.avgTurn - a.avgTurn).slice(0, 20);
  console.log("\nWorst things (truthful by 20 / noisy by 25 / avg truthful end turn):");
  for (const w of worst) console.log(`  ${w.id.padEnd(22)} ${pct(w.truthful).padStart(6)} ${pct(w.noisy).padStart(6)}   ${w.avgTurn.toFixed(1)}`);

  // Confusions: true thing -> thing guessed wrongly. Counted over both passes; the truthful-only count is shown too.
  const pairs = new Map<string, { all: number; truthful: number }>();
  for (const g of games)
    for (const w of g.wrong) {
      const key = `${name(g.thing)} -> ${name(w)}`;
      const e = pairs.get(key) ?? { all: 0, truthful: 0 };
      e.all++;
      if (g.pass === "truthful") e.truthful++;
      pairs.set(key, e);
    }
  const top = [...pairs.entries()].sort((a, b) => b[1].all - a[1].all).slice(0, 20);
  console.log("\nMost-confused pairs (true thing -> wrongly guessed; both passes / truthful only):");
  for (const [k, v] of top) console.log(`  ${k.padEnd(40)} ${String(v.all).padStart(3)} / ${v.truthful}`);

  const lost = games.filter((g) => g.pass === "truthful" && !(g.won && g.turn <= 20)).length;
  console.log(`\nTruthful games not won by turn 20: ${lost} of ${games.filter((g) => g.pass === "truthful").length}`);
  if (rt < TARGET.truthful.rate || rn < TARGET.noisy.rate) process.exitCode = 1;
}

const wi = process.argv.indexOf("--worker");
if (wi >= 0) {
  const out = runSlice(fileURLToPath(new URL("../kb/kb.json", import.meta.url)), Number(process.argv[wi + 1]), Number(process.argv[wi + 2]));
  // Exit only once the parent has the whole result: exiting right after send() truncated big
  // messages, and the run ended silently with no report.
  process.send!(out, undefined, undefined, () => process.exit(0));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
