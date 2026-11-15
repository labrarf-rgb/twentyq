// Review tool: trace one sheet row through the engine. tsx scripts/review/trace.ts <id> [seedIndex]
// Shows each turn, the answer, the KB's value for the true thing, and the true thing's rank and weight.
import { Session } from "../../src/engine/engine";
import { compileKB, valueName } from "../../src/engine/kb";
import { loadKB } from "../lib/kb-io";
import { loadSheets } from "../lib/playerbench";

const id = process.argv[2];
const run = Number(process.argv[3] ?? 0);
const kb = loadKB();
const ckb = compileKB(kb);
const rows = loadSheets();
const ri = rows.findIndex((r) => r.id === id);
const r = rows[ri];
const ti = ckb.tIndex.get(id)!;
const sheetRows = rows.filter((x) => x.sheet === r.sheet);
const s = new Session(ckb, (sheetRows.indexOf(r) * 7919 + run * 104729 + 12345) | 0);
const rank = () => { let k = 1; for (let i = 0; i < ckb.N; i++) if (s.w[i] > s.w[ti]) k++; return k; };
const t = kb.things[ti];
console.log(`${id}: category ${t.category} alt ${(t.altCategories ?? []).join(",")}`);
while (s.current) {
  const cur = s.current;
  let a: string, label: string, v = "";
  if (cur.kind === "category") { a = r.cats[cur.cat] ?? "no"; label = "cat:" + kb.categories[cur.cat]; v = valueName(ckb.cats[ti * 3 + cur.cat]); }
  else if (cur.kind === "question") { const q = kb.questions[cur.q].id; a = r.yes.has(q) ? "yes" : r.maybe.has(q) ? "maybe" : "no"; label = q; v = valueName(ckb.values[ti * ckb.Q + cur.q]); }
  else { a = cur.thing === ti ? "right" : "wrong"; label = "GUESS " + ckb.things[cur.thing].id + ` (${s.w[cur.thing].toFixed(2)})`; }
  s.apply(a as "yes");
  const top = s.topN(3).map((i) => `${ckb.things[i].id} ${s.w[i].toFixed(2)}`).join(", ");
  const flag = v && ((v === "yes" && a === "no") || (v === "no" && a === "yes")) ? " !!" : v && v !== a && !(v === "unknown") ? " ~" : "";
  console.log(`  ${String(cur.turn).padStart(2)} ${label.padEnd(30)} ${a.padEnd(6)} kb:${v.padEnd(7)}${flag.padEnd(3)} rank ${String(rank()).padStart(4)} w ${s.w[ti].toExponential(1)}   top: ${top}`);
}
console.log(JSON.stringify(s.result));
// full mismatch list
const mm: string[] = [];
kb.questions.forEach((q, qi) => { const v = valueName(ckb.values[ti * ckb.Q + qi]); const a = r.yes.has(q.id) ? "yes" : r.maybe.has(q.id) ? "maybe" : "no"; if (v !== a && v !== "unknown") mm.push(`${q.id}: sheet ${a}, kb ${v}`); });
console.log("mismatches:\n  " + mm.join("\n  "));
