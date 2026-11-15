// Write one lab config into kb/kb.json. v10 ran it once: "3 +endgame 12/.5" --write kb-2026.11.15.1 (on kb-2026.11.07.2).
//   tsx scripts/review/apply.ts "<config name in configs-final.json>"                 (dry run: prints what would change)
//   tsx scripts/review/apply.ts "<config name>" --write kb-2026.11.xx.y               (writes, with the new kbVersion)
// Afterwards: npm run kb:check && npm run kb:vectors && npm test && npm run kb:bench.
// Only the data-only configs ("1 L1 table", "2 +people +worldwide") are safe to ship before the Android port:
// the others put constants in kb.engine that the Kotlin engine does not know yet.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatKB } from "../kb-format";
import { KB_PATH, loadKB } from "../lib/kb-io";
import { buildKB, type Config } from "./lab";

const name = process.argv[2];
const configs: Config[] = JSON.parse(readFileSync(fileURLToPath(new URL("./configs-final.json", import.meta.url)), "utf8"));
const cfg = configs.find((c) => c.name === name);
if (!cfg) {
  console.error(`no config "${name}". Have: ${configs.map((c) => `"${c.name}"`).join(", ")}`);
  process.exit(1);
}
const before = loadKB();
const after = buildKB(cfg);
let rows = 0, cells = 0;
after.things.forEach((t, i) => {
  const b = before.things[i];
  const moved = [...t.yes, ...(t.maybe ?? []), ...(t.unknown ?? [])].length; // same cells, different lists
  const same = JSON.stringify([b.yes, b.maybe ?? [], b.unknown ?? []]) === JSON.stringify([t.yes, t.maybe ?? [], t.unknown ?? []]);
  if (!same) {
    rows++;
    cells += b.yes.filter((id) => !t.yes.includes(id)).length;
  }
  void moved;
});
console.log(`${cfg.name}: ${rows} things change (${cells} cells leave "yes"); engine block ${JSON.stringify(before.engine) === JSON.stringify(after.engine) ? "unchanged" : "changes"}`);
if (JSON.stringify(before.engine) !== JSON.stringify(after.engine)) console.log("engine: " + JSON.stringify(after.engine));
const wi = process.argv.indexOf("--write");
if (wi >= 0) {
  const version = process.argv[wi + 1];
  if (!version) throw new Error("--write needs the new kbVersion");
  writeFileSync(KB_PATH, formatKB({ ...after, kbVersion: version }));
  console.log(`wrote ${KB_PATH} as ${version}`);
}
