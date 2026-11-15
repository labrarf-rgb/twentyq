// Review tool: is the engine's confidence honest? Buckets every guess in game 1 of the held-out sheets by the
// weight it was made at, and prints how often it was right. tsx scripts/review/calibration.ts ['<config json>']
import { Session } from "../../src/engine/engine";
import { compileKB } from "../../src/engine/kb";
import { loadSheets } from "../lib/playerbench";
import { buildKB, type Config } from "./lab";

const cfg: Config = process.argv[2] ? JSON.parse(process.argv[2]) : { name: "baseline" };
const kb = buildKB(cfg);
const ckb = compileKB(kb);
const rows = loadSheets().filter((r) => ckb.tIndex.has(r.id));
const edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1.01];
const n = edges.map(() => 0), hit = edges.map(() => 0), sumW = edges.map(() => 0);
let rankSum = 0, games = 0, top1 = 0, top3 = 0, top10 = 0;
rows.forEach((r, ri) => {
  const ti = ckb.tIndex.get(r.id)!;
  for (let seed = 0; seed < 8; seed++) {
    const s = new Session(ckb, (ri * 7919 + seed * 104729 + 12345) | 0);
    let firstGuessDone = false;
    while (s.current) {
      const cur = s.current;
      if (cur.kind === "category") s.apply(r.cats[cur.cat] ?? "no");
      else if (cur.kind === "question") { const q = kb.questions[cur.q].id; s.apply(r.yes.has(q) ? "yes" : r.maybe.has(q) ? "maybe" : "no"); }
      else {
        const w = s.w[cur.thing];
        const b = edges.findIndex((e, k) => w >= e && w < edges[k + 1]);
        n[b]++; sumW[b] += w; if (cur.thing === ti) hit[b]++;
        if (!firstGuessDone) { firstGuessDone = true; let k = 1; for (let i = 0; i < ckb.N; i++) if (s.w[i] > s.w[ti]) k++; rankSum += k; games++; if (k === 1) top1++; if (k <= 3) top3++; if (k <= 10) top10++; }
        s.apply(cur.thing === ti ? "right" : "wrong");
      }
    }
  }
});
console.log(`${cfg.name}: guesses by stated weight (all turns)\n  weight       guesses  mean weight  right`);
edges.slice(0, -1).forEach((e, k) => { if (n[k]) console.log(`  ${e.toFixed(2)}-${Math.min(1, edges[k + 1]).toFixed(2)}  ${String(n[k]).padStart(7)}  ${(sumW[k] / n[k]).toFixed(2).padStart(10)}  ${((hit[k] / n[k]) * 100).toFixed(0).padStart(4)}%`); });
console.log(`  true thing at the first guess: rank 1 ${((top1 / games) * 100).toFixed(0)}%, top 3 ${((top3 / games) * 100).toFixed(0)}%, top 10 ${((top10 / games) * 100).toFixed(0)}%`);
