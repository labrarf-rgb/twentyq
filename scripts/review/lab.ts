// Review lab: measure engine/KB variants side by side. Never edits kb.json.
// Since v10 the KB it loads already has the L1 table, the people and worldwide rows and the endgame, so every
// config in configs-final.json now runs on top of v10 ("0 today" means v10). The review's own numbers reproduce
// from commit b3e5329, where kb.json was still kb-2026.11.07.2.
//   tsx scripts/review/lab.ts <configs.json | inline JSON array> [--seeds 12] [--stride 5] [--self-seeds 2] [--no-self] [--repeat]
// A config is { name, engine?: partial engine constants (likelihood included), patch?: [names of KB patches below] }.
// Per config it reports game 1 on each player sheet (won by turn 20 / 25) and, on every Nth KB thing, self-play
// truthful (by 20), 10% random flips (by 25, the SPECS 6 pass) and "sheet-like" disagreement (by 20 / 25): each answer
// drawn from P(answer | KB value) as measured on the held-out sheets, which is how they really disagree with the KB.
import { fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Session } from "../../src/engine/engine";
import { compileKB, V_MAYBE, V_NO, V_UNKNOWN, V_YES, type CompiledKB } from "../../src/engine/kb";
import { mulberry32 } from "../../src/engine/rng";
import type { AnswerToken, EngineConstants, KB, LogGame, QuestionAnswer } from "../../src/engine/types";
import { loadKB } from "../lib/kb-io";
import { categoryAnswer, flip, truthfulAnswer } from "../lib/player";
import { loadSheets, playRow, type SheetRow } from "../lib/playerbench";
import { PATCHES } from "./patches";

export interface Config {
  name: string;
  engine?: Partial<EngineConstants> & Record<string, unknown>;
  patch?: string[];
}

/** P(answer | KB value) pooled over the cells the engine asked on fable-40 and coordinator-49 (yes, maybe, no). */
export const SHEET_LIKE: Record<number, [number, number, number]> = {
  [V_YES]: [0.81, 0.1, 0.09],
  [V_MAYBE]: [0.14, 0.4, 0.46],
  [V_NO]: [0.004, 0.052, 0.944],
  [V_UNKNOWN]: [0.0, 0.1, 0.9],
};
const TOK: QuestionAnswer[] = ["yes", "maybe", "no"];
function draw(p: [number, number, number], r: number): QuestionAnswer {
  return r < p[0] ? "yes" : r < p[0] + p[1] ? "maybe" : "no";
}

/**
 * Engine constants of the 2026-11-14 review prototypes that v10 took out of the shipped engine (SESSIONS
 * 2026-11-15). The engine would silently ignore them, so a config that sets one fails here instead of printing
 * numbers that are really the config without it. Configs 4 and 5 in configs-final.json can no longer be run.
 */
const REMOVED = ["categoryQuestions", "commonBoost", "softReliability", "guessRatio"];

export function buildKB(cfg: Config): KB {
  const gone = REMOVED.filter((k) => cfg.engine && k in cfg.engine);
  if (gone.length) throw new Error(`config "${cfg.name}" sets ${gone.join(", ")}: removed from the engine in v10 (see docs/SESSIONS.md, 2026-11-15)`);
  for (const p of cfg.patch ?? []) if (!PATCHES[p]) throw new Error(`config "${cfg.name}": no KB patch "${p}" (common and soft were removed in v10)`);
  let kb = loadKB();
  for (const p of cfg.patch ?? []) kb = PATCHES[p](kb);
  if (cfg.engine) kb = { ...kb, engine: { ...kb.engine, ...cfg.engine } as EngineConstants };
  return kb;
}

type Pass = "truthful" | "noisy" | "sheetlike";
function selfGame(ckb: CompiledKB, thing: number, run: number, pass: Pass): { won: boolean; turn: number } {
  // the same seeds as kb:bench for truthful and noisy, so the numbers line up with it
  const seed = (thing * 7919 + run * 104729 + (pass === "noisy" ? 1299709 : pass === "sheetlike" ? 2750159 : 0)) | 0;
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const s = new Session(ckb, seed);
  while (s.current) {
    const cur = s.current;
    let a: AnswerToken;
    if (cur.kind === "guess") a = cur.thing === thing ? "right" : "wrong";
    else if (pass === "sheetlike") {
      const v = cur.kind === "category" ? ckb.cats[thing * 3 + cur.cat] : ckb.values[thing * ckb.Q + cur.q];
      // category questions: the sheets answer a KB "maybe" category mostly No, a "yes" category Yes
      a = cur.kind === "category" ? draw(v === V_YES ? [0.93, 0.07, 0] : v === V_MAYBE ? [0.32, 0.0, 0.68] : [0, 0, 1], rnd()) : draw(SHEET_LIKE[v], rnd());
    } else {
      let qa = cur.kind === "category" ? categoryAnswer(ckb, thing, cur.cat, rnd, "random") : truthfulAnswer(ckb, thing, cur.q, rnd, "random");
      if (pass === "noisy" && rnd() < 0.1) qa = flip(qa, rnd);
      a = qa;
    }
    s.apply(a);
  }
  return { won: s.result!.outcome === "win", turn: s.result!.turn };
}

/** A sheet player who does not answer identically every game: each sheet answer wobbles a little. */
function wobble(row: SheetRow, rnd: () => number): SheetRow {
  // not used for game 1 numbers; see playSeries
  void rnd;
  return row;
}
const WOBBLE = { yes: [0.86, 0.1, 0.04], maybe: [0.25, 0.5, 0.25], no: [0.012, 0.03, 0.958] } as const;
function playRowWobbly(ckb: CompiledKB, row: SheetRow, seed: number, inKb: boolean, rnd: () => number) {
  // answers are drawn per question as it is asked; a fresh draw each game
  const yes = new Set<string>();
  const maybe = new Set<string>();
  for (const q of ckb.kb.questions) {
    const base = row.yes.has(q.id) ? WOBBLE.yes : row.maybe.has(q.id) ? WOBBLE.maybe : WOBBLE.no;
    const a = draw(base as unknown as [number, number, number], rnd());
    if (a === "yes") yes.add(q.id);
    else if (a === "maybe") maybe.add(q.id);
  }
  return playRow(ckb, { ...row, yes, maybe }, seed, inKb);
}

interface T { n: number; by20: number; by25: number; turnSum: number; wins: number }
const T0 = (): T => ({ n: 0, by20: 0, by25: 0, turnSum: 0, wins: 0 });
const addT = (t: T, won: boolean, turn: number) => { t.n++; if (won) { t.wins++; t.turnSum += turn; if (turn <= 20) t.by20++; if (turn <= 25) t.by25++; } };
const merge = (a: T, b: T) => { a.n += b.n; a.by20 += b.by20; a.by25 += b.by25; a.turnSum += b.turnSum; a.wins += b.wins; };

type Task = { cfg: Config } & ({ kind: "sheet"; seedLo: number; seedHi: number; repeat: boolean; wobbly: boolean } | { kind: "self"; lo: number; hi: number; stride: number; seeds: number });
type Result = Record<string, T>;

function runTask(t: Task): Result {
  const kb = buildKB(t.cfg);
  const ckb = compileKB(kb);
  const out: Result = {};
  const get = (k: string) => (out[k] ??= T0());
  if (t.kind === "self") {
    for (let i = t.lo; i < t.hi; i++) {
      if (i % t.stride !== 0) continue;
      for (const pass of ["truthful", "noisy", "sheetlike"] as const)
        for (let run = 0; run < t.seeds; run++) { const r = selfGame(ckb, i, run, pass); addT(get("self:" + pass), r.won, r.turn); }
    }
    return out;
  }
  const rows = loadSheets();
  const bySheet = new Map<string, number>();
  rows.forEach((row) => {
    const ri = bySheet.get(row.sheet) ?? 0; // index within its sheet, as kb:bench:players --sheet uses
    bySheet.set(row.sheet, ri + 1);
    const inKb = ckb.tIndex.has(row.id);
    for (let run = t.seedLo; run < t.seedHi; run++) {
      const seedFor = (g: number) => (ri * 7919 + run * 104729 + g * 15485863 + 12345) | 0;
      if (!t.repeat) {
        const r = playRow(ckb, row, seedFor(0), inKb);
        addT(get(`g1:${row.sheet}${inKb ? "" : ":novel"}`), r.won, r.turn);
        addT(get(`row:${row.sheet}:${row.id}`), r.won, r.turn);
        continue;
      }
      const log: LogGame[] = [];
      const rnd = mulberry32(seedFor(99) ^ 0x2545f491);
      for (let g = 0; g < 3; g++) {
        const c = g === 0 ? ckb : compileKB(kb, log);
        const r = t.wobbly ? playRowWobbly(c, row, seedFor(g), inKb, rnd) : playRow(c, row, seedFor(g), inKb);
        addT(get(`g${g + 1}:${row.sheet}${inKb ? "" : ":novel"}`), r.won, r.turn);
        log.push(r.log);
      }
    }
  });
  void wobble;
  return out;
}

const pc = (t: T | undefined, k: "by20" | "by25") => (t && t.n ? ((t[k] / t.n) * 100).toFixed(1) : "  - ").padStart(5);

if (process.argv.includes("--worker")) {
  const t: Task = JSON.parse(process.argv[process.argv.indexOf("--worker") + 1]);
  process.send!(runTask(t), undefined, undefined, () => process.exit(0));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv;
  const num = (n: string, d: number) => (argv.includes(n) ? Number(argv[argv.indexOf(n) + 1]) : d);
  const src = argv[2];
  const configs: Config[] = JSON.parse(src.trim().startsWith("[") ? src : readFileSync(src, "utf8"));
  const SEEDS = num("--seeds", 12);
  const STRIDE = num("--stride", 5);
  const SELF_SEEDS = num("--self-seeds", 2);
  const REPEAT = argv.includes("--repeat");
  const WOBBLY = argv.includes("--wobbly");
  const N = loadKB().things.length;
  const tasks: Task[] = [];
  for (const cfg of configs) {
    const chunk = REPEAT ? 1 : 3;
    for (let s = 0; s < SEEDS; s += chunk) tasks.push({ cfg, kind: "sheet", seedLo: s, seedHi: Math.min(SEEDS, s + chunk), repeat: REPEAT, wobbly: WOBBLY });
    if (!argv.includes("--no-self")) {
      const parts = STRIDE === 1 ? 14 : 4;
      const per = Math.ceil(N / parts);
      for (let p = 0; p < parts; p++) tasks.push({ cfg, kind: "self", lo: p * per, hi: Math.min(N, (p + 1) * per), stride: STRIDE, seeds: SELF_SEEDS });
    }
  }
  const results = new Map<string, Result>(configs.map((c) => [c.name, {}]));
  const pool = Math.max(1, availableParallelism() - 1);
  let next = 0, done = 0;
  const t0 = Date.now();
  new Promise<void>((resolve, reject) => {
    const lane = () => {
      if (next >= tasks.length) return;
      const task = tasks[next++];
      const child = fork(fileURLToPath(import.meta.url), ["--worker", JSON.stringify(task)], { execArgv: process.execArgv });
      child.on("message", (m) => { const acc = results.get(task.cfg.name)!; for (const [k, v] of Object.entries(m as Result)) merge((acc[k] ??= T0()), v); });
      child.on("error", reject);
      child.on("exit", (code) => { if (code !== 0) return reject(new Error("worker exited " + code)); if (++done === tasks.length) resolve(); else lane(); });
    };
    for (let i = 0; i < Math.min(pool, tasks.length); i++) lane();
  }).then(() => {
    console.log(`\n${configs.length} configs, sheets x ${SEEDS} seeds${REPEAT ? " x 3 games" + (WOBBLY ? " (wobbly player)" : "") : ""}, self-play every ${STRIDE}th thing x ${SELF_SEEDS} seeds (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    const sheets = ["fable-40.txt", "coordinator-49.txt", "novel-not-in-kb-10.txt", "fable-novel-8.txt"];
    if (!REPEAT) {
      console.log("                               | fable-40     | coord-49     | both  | self truthful | 10% flips | sheet-like    | avg win turn");
      console.log("config                         | by20   by25  | by20   by25  | by20  | by20          | by25      | by20   by25   | f40  c49");
      for (const c of configs) {
        const r = results.get(c.name)!;
        const f = r["g1:fable-40.txt"], k = r["g1:coordinator-49.txt"];
        const both = f && k ? (((f.by20 + k.by20) / (f.n + k.n)) * 100).toFixed(1) : "-";
        console.log(`${c.name.padEnd(30)} | ${pc(f, "by20")}  ${pc(f, "by25")} | ${pc(k, "by20")}  ${pc(k, "by25")} | ${both.padStart(5)} | ${pc(r["self:truthful"], "by20")}         | ${pc(r["self:noisy"], "by25")}     | ${pc(r["self:sheetlike"], "by20")}  ${pc(r["self:sheetlike"], "by25")}  | ${f ? (f.turnSum / Math.max(1, f.wins)).toFixed(1) : ""}  ${k ? (k.turnSum / Math.max(1, k.wins)).toFixed(1) : ""}`);
      }
      if (argv.includes("--rows")) for (const c of configs) {
        const r = results.get(c.name)!;
        const lost = Object.entries(r).filter(([k, v]) => k.startsWith("row:") && v.by20 < v.n).sort((a, b) => a[1].by20 - b[1].by20);
        console.log(`\n${c.name}: rows not always won by 20 (wins/games): ` + lost.map(([k, v]) => `${k.split(":")[2]} ${v.by20}/${v.n}`).join(", "));
      }
    } else {
      for (const c of configs) {
        const r = results.get(c.name)!;
        console.log(`\n${c.name}`);
        for (const s of sheets) for (const suffix of ["", ":novel"]) {
          if (!r[`g1:${s}${suffix}`]) continue;
          console.log(`  ${(s + suffix).padEnd(32)} ` + [1, 2, 3].map((g) => `g${g} ${pc(r[`g${g}:${s}${suffix}`], "by20")} / ${pc(r[`g${g}:${s}${suffix}`], "by25")}`).join("   "));
        }
      }
    }
  });
}
