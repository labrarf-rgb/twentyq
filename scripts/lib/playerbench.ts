// The player benchmark (SPECS 11.5): held-out answer sheets played through the real engine,
// including repeat play against an in-memory game log.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Session } from "../../src/engine/engine";
import { compileKB, type CompiledKB } from "../../src/engine/kb";
import { normalizeName } from "../../src/engine/learn";
import { nearOf } from "../../src/engine/near";
import type { AnswerToken, EngineConstants, KB, LogGame, QuestionAnswer } from "../../src/engine/types";

export const SHEETS_DIR = fileURLToPath(new URL("../../kb/player-sheets/", import.meta.url));

export interface SheetRow {
  sheet: string;
  id: string;
  cats: QuestionAnswer[];
  yes: Set<string>;
  maybe: Set<string>;
}

const CAT_TOKEN: Record<string, QuestionAnswer> = { y: "yes", n: "no", m: "maybe", s: "skip" };

/** `id | category answers | YES ids | SOMETIMES ids`; anything not listed is No. `#` lines are comments. */
export function parseSheet(name: string, text: string): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [id, cats = "", yes = "", maybe = ""] = line.split("|").map((s) => s.trim());
    const cs = cats.split(/\s+/).filter(Boolean).map((t) => {
      const a = CAT_TOKEN[t.toLowerCase()];
      if (!a) throw new Error(`${name}: "${id}": category answer "${t}" is not y, n, m or s`);
      return a;
    });
    rows.push({ sheet: name, id, cats: cs, yes: new Set(yes.split(/\s+/).filter(Boolean)), maybe: new Set(maybe.split(/\s+/).filter(Boolean)) });
  }
  return rows;
}

export function loadSheets(dir = SHEETS_DIR): SheetRow[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .flatMap((f) => parseSheet(f, readFileSync(dir + f, "utf8")));
}

/** Question ids named by a sheet that the KB does not have (a typo would silently become No). */
export function unknownQuestionIds(kb: KB, rows: SheetRow[]): string[] {
  const known = new Set(kb.questions.map((q) => q.id));
  const bad = new Set<string>();
  for (const r of rows) for (const id of [...r.yes, ...r.maybe]) if (!known.has(id)) bad.add(`${r.sheet}: ${r.id}: ${id}`);
  return [...bad];
}

/** A sheet thing the KB does not have is taught by name, the way a player would type it. */
export function displayName(id: string): string {
  return id.replace(/_/g, " ");
}

export interface GameResult {
  won: boolean;
  turn: number;
  log: LogGame;
}

/** One game of one sheet row on a compiled KB. The player answers Right only on the true thing. */
export function playRow(ckb: CompiledKB, row: SheetRow, seed: number, inKb: boolean): GameResult {
  const s = new Session(ckb, seed);
  const target = inKb ? ckb.tIndex.get(row.id)! : ckb.tIndex.get("learned:" + normalizeName(displayName(row.id)));
  while (s.current) {
    const cur = s.current;
    let a: AnswerToken;
    if (cur.kind === "category") a = row.cats[cur.cat] ?? "no";
    else if (cur.kind === "question") {
      const id = ckb.kb.questions[cur.q].id;
      a = row.yes.has(id) ? "yes" : row.maybe.has(id) ? "maybe" : "no";
    } else a = cur.thing === target ? "right" : "wrong";
    s.apply(a);
  }
  const r = s.result!;
  const turns = s.entries.map((e) => ({
    id: e.kind === "category" ? "cat:" + e.id : e.kind === "guess" ? "guess:" + e.id : e.id!,
    a: e.answer as string,
  }));
  const won = r.outcome === "win";
  // Wins record the guessed thing; a stumped player picks what they meant from the stump screen.
  const actual = inKb ? { id: row.id } : { name: displayName(row.id) };
  const log: LogGame = { ts: 1, kbVersion: ckb.kb.kbVersion, outcome: r.outcome, turn: r.turn, turns, actual };
  if (!inKb) log.near = nearOf(ckb, s.entries); // a name the KB lacks also stores what the game looked like
  return { won, turn: r.turn, log };
}

export interface Tally {
  games: number;
  by20: number;
  by25: number;
  winTurnSum: number;
  wins: number;
}
const tally = (): Tally => ({ games: 0, by20: 0, by25: 0, winTurnSum: 0, wins: 0 });
function add(t: Tally, r: GameResult) {
  t.games++;
  if (r.won) {
    t.wins++;
    t.winTurnSum += r.turn;
    if (r.turn <= 20) t.by20++;
    if (r.turn <= 25) t.by25++;
  }
}

export interface PlayerBenchOptions {
  seeds: number;
  /** games per thing in a row */
  repeats: number;
  /** override engine constants in memory (the tuning grid) */
  constants?: Partial<EngineConstants>;
  /** play only game 1 (no learning): cheap, for the constants grid */
  firstOnly?: boolean;
}

export interface PlayerBenchResult {
  /** [game number - 1] -> tally, each thing with its own fresh log (isolates the effect of repeat play) */
  isolated: Tally[];
  /** the same, but all things share one log, played round-robin (more like a real device) */
  shared: Tally[];
  /** per sheet row: wins by turn 20 for each game number (isolated) */
  perRow: { id: string; sheet: string; inKb: boolean; wins20: number[]; n: number }[];
  notInKb: string[];
  rows: number;
}

const seedFor = (rowIndex: number, run: number, game: number) => (rowIndex * 7919 + run * 104729 + game * 15485863 + 12345) | 0;

export function runPlayerBench(kb0: KB, rows: SheetRow[], o: PlayerBenchOptions): PlayerBenchResult {
  const kb: KB = o.constants ? { ...kb0, engine: { ...kb0.engine, ...o.constants } } : kb0;
  const base = compileKB(kb);
  const inKb = rows.map((r) => base.tIndex.has(r.id));
  const G = o.firstOnly ? 1 : o.repeats;
  const isolated = Array.from({ length: G }, tally);
  const shared = Array.from({ length: G }, tally);
  const perRow = rows.map((r, i) => ({ id: r.id, sheet: r.sheet, inKb: inKb[i], wins20: Array(G).fill(0) as number[], n: o.seeds }));

  for (let run = 0; run < o.seeds; run++) {
    // isolated: one thing, one fresh log
    rows.forEach((row, ri) => {
      const log: LogGame[] = [];
      for (let g = 0; g < G; g++) {
        const ckb = g === 0 ? base : compileKB(kb, log);
        const r = playRow(ckb, row, seedFor(ri, run, g), inKb[ri]);
        add(isolated[g], r);
        if (r.won && r.turn <= 20) perRow[ri].wins20[g]++;
        log.push(r.log);
      }
    });
    if (o.firstOnly) {
      // the shared pass of game 1 is the same games again
      continue;
    }
    // shared: every thing once, then every thing again, then again, all on one log
    const log: LogGame[] = [];
    for (let g = 0; g < G; g++) {
      const ckb = g === 0 ? base : compileKB(kb, log);
      const results = rows.map((row, ri) => playRow(ckb, row, seedFor(ri, run, g), inKb[ri])); // same compile within a round
      results.forEach((r) => {
        add(shared[g], r);
        log.push(r.log);
      });
    }
  }
  return { isolated, shared, perRow, notInKb: rows.filter((_, i) => !inKb[i]).map((r) => r.id), rows: rows.length };
}

export const pct = (x: number) => (x * 100).toFixed(1) + "%";
export const rate = (t: Tally, k: "by20" | "by25") => (t.games ? t[k] / t.games : 0);
export const avgWin = (t: Tally) => (t.wins ? t.winTurnSum / t.wins : 0);
