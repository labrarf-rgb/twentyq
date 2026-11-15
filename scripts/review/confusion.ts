// Review tool: how the held-out sheets answer against the KB's values.
//   tsx scripts/review/confusion.ts [--sheet name.txt]
// Prints P(sheet answer | KB value) over all cells, over the cells the engine actually asks in game 1,
// and the per-question disagreement rate. Reads sheets, so never use its output to edit KB rows.
import { Session } from "../../src/engine/engine";
import { compileKB, V_MAYBE, V_NO, V_UNKNOWN, V_YES } from "../../src/engine/kb";
import { loadKB } from "../lib/kb-io";
import { loadSheets } from "../lib/playerbench";

const argv = process.argv;
const only = argv.includes("--sheet") ? argv[argv.indexOf("--sheet") + 1] : undefined;
const kb = loadKB();
const ckb = compileKB(kb);
let rows = loadSheets().filter((r) => ckb.tIndex.has(r.id));
if (only) rows = rows.filter((r) => r.sheet === only);
const VN = ["yes", "maybe", "no", "unknown"];
const AN = ["yes", "maybe", "no"];
const ans = (r: (typeof rows)[0], qid: string) => (r.yes.has(qid) ? 0 : r.maybe.has(qid) ? 1 : 2);
const show = (label: string, m: number[][]) => {
  console.log(`\n${label}\n  KB value   n      P(yes)  P(maybe)  P(no)`);
  m.forEach((row, v) => {
    const n = row[0] + row[1] + row[2];
    if (n) console.log(`  ${VN[v].padEnd(8)} ${String(n).padStart(6)}  ${row.map((x) => (x / n).toFixed(3).padStart(7)).join("  ")}`);
  });
};
const all = [0, 1, 2, 3].map(() => [0, 0, 0]);
const perQ = kb.questions.map(() => ({ n: 0, bad: 0, yesOnNo: 0, noOnYes: 0 }));
for (const r of rows) {
  const ti = ckb.tIndex.get(r.id)!;
  kb.questions.forEach((q, qi) => {
    const v = ckb.values[ti * ckb.Q + qi];
    const a = ans(r, q.id);
    all[v][a]++;
    perQ[qi].n++;
    if ((v === V_YES && a === 2) || (v === V_NO && a === 0)) perQ[qi].bad++;
    if (v === V_NO && a === 0) perQ[qi].yesOnNo++;
    if (v === V_YES && a === 2) perQ[qi].noOnYes++;
  });
}
show(`All cells (${rows.length} sheet rows x ${ckb.Q} questions)`, all);

// category cells
const cat = [0, 1, 2, 3].map(() => [0, 0, 0]);
for (const r of rows) {
  const ti = ckb.tIndex.get(r.id)!;
  r.cats.forEach((a, c) => {
    if (a === "skip") return;
    cat[ckb.cats[ti * 3 + c]][a === "yes" ? 0 : a === "maybe" ? 1 : 2]++;
  });
}
show("Category questions as answered", cat);

// cells the engine asks in game 1, 6 seeds
const asked = [0, 1, 2, 3].map(() => [0, 0, 0]);
const askedQ = kb.questions.map(() => 0);
let hardMiss = 0, games = 0, missSum = 0;
const missHist: number[] = [];
for (const r of rows) {
  const ti = ckb.tIndex.get(r.id)!;
  for (let seed = 0; seed < 6; seed++) {
    const s = new Session(ckb, (rows.indexOf(r) * 7919 + seed * 104729 + 12345) | 0);
    let miss = 0;
    while (s.current) {
      const cur = s.current;
      if (cur.kind === "category") s.apply(r.cats[cur.cat] ?? "no");
      else if (cur.kind === "question") {
        const qid = kb.questions[cur.q].id;
        const a = ans(r, qid);
        const v = ckb.values[ti * ckb.Q + cur.q];
        asked[v][a]++;
        askedQ[cur.q]++;
        if ((v === V_YES && a === 2) || (v === V_NO && a === 0)) miss++;
        s.apply(AN[a] as "yes");
      } else s.apply(cur.thing === ti ? "right" : "wrong");
    }
    games++;
    missSum += miss;
    missHist[miss] = (missHist[miss] ?? 0) + 1;
    if (miss > 0) hardMiss++;
  }
}
show("Cells the engine asked (game 1, 6 seeds)", asked);
console.log(`\nHard contradictions (yes on KB no, or no on KB yes) per game: mean ${(missSum / games).toFixed(2)}; games with at least one: ${((hardMiss / games) * 100).toFixed(0)}%`);
console.log("  histogram: " + missHist.map((n, k) => `${k}:${n ?? 0}`).join("  "));

const worst = perQ.map((p, qi) => ({ id: kb.questions[qi].id, ...p, asked: askedQ[qi] })).filter((p) => p.bad > 0).sort((a, b) => b.bad / b.n - a.bad / a.n).slice(0, 30);
console.log("\nQuestions the sheets contradict most (hard contradictions / rows; yes-on-no, no-on-yes; times asked):");
for (const w of worst) console.log(`  ${w.id.padEnd(24)} ${((w.bad / w.n) * 100).toFixed(0).padStart(3)}%  ${String(w.yesOnNo).padStart(2)} ${String(w.noOnYes).padStart(2)}   asked ${w.asked}`);
void V_MAYBE; void V_UNKNOWN;
