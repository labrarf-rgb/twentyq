// v9 (SPECS 11.2): which KB things a finished game looked most like, stored as `near` in the game log
// when it teaches a name the KB does not have.
import type { CompiledKB } from "./kb";
import type { RecapEntry } from "./types";

export const NEAR_COUNT = 5;

/**
 * Replay the game's category and question answers (yes, maybe, no only; skips and guess turns are
 * ignored, so a wrongly guessed look-alike still counts) on a fresh uniform weight vector over all
 * things of the compile the game was played on, normalizing after each answer in index order. Then
 * take the top 5 **KB** things (ties to the lower index, weights above zero), renormalize over those 5,
 * and round each to 4 decimals. Returns [thing id, weight] pairs, highest first.
 */
export function nearOf(ckb: CompiledKB, entries: readonly RecapEntry[]): [string, number][] {
  const { N, nKb } = ckb;
  const w = new Float64Array(N).fill(1 / N);
  for (const e of entries) {
    if (e.kind === "guess") continue;
    const a = e.answer === "yes" ? 0 : e.answer === "maybe" ? 1 : e.answer === "no" ? 2 : -1;
    if (a < 0) continue;
    let p: Float64Array;
    let base: number;
    if (e.kind === "category") {
      const c = ckb.kb.categories.indexOf(e.id as never);
      if (c < 0 || c > 2) continue;
      p = ckb.PC[a];
      base = c * N;
    } else {
      const q = ckb.qIndex.get(e.id!);
      if (q === undefined) continue;
      p = ckb.P[a];
      base = q * N;
    }
    let s = 0;
    for (let i = 0; i < N; i++) {
      w[i] *= p[base + i];
      s += w[i];
    }
    if (s > 0) for (let i = 0; i < N; i++) w[i] = w[i] / s;
  }
  const idx: number[] = [];
  for (let i = 0; i < nKb; i++) if (w[i] > 0) idx.push(i);
  idx.sort((x, y) => w[y] - w[x] || x - y);
  const top = idx.slice(0, NEAR_COUNT);
  let sum = 0;
  for (const i of top) sum += w[i];
  if (!(sum > 0)) return [];
  return top.map((i) => [ckb.things[i].id, Math.round((w[i] / sum) * 1e4) / 1e4] as [string, number]);
}
