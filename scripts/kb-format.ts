// npm run kb:format: rewrite kb/kb.json in the compact house format: header on a few lines, then one
// question and one thing per line with no spaces. Same data, smaller file, still easy to diff.
import { readFileSync, writeFileSync } from "node:fs";
import { KB_PATH } from "./lib/kb-io";

export function formatKB(kb: any): string {
  const j = (x: unknown) => JSON.stringify(x);
  const lines = (xs: unknown[]) => xs.map((x) => j(x)).join(",\n");
  return (
    `{\n"schemaVersion":${j(kb.schemaVersion)},\n"kbVersion":${j(kb.kbVersion)},\n"categories":${j(kb.categories)},\n"engine":${j(kb.engine)},\n` +
    `"questions":[\n${lines(kb.questions)}\n],\n"things":[\n${lines(kb.things)}\n]\n}\n`
  );
}

if (process.argv[1] && process.argv[1].endsWith("kb-format.ts")) {
  const before = readFileSync(KB_PATH, "utf8");
  const kb = JSON.parse(before);
  const out = formatKB(kb);
  writeFileSync(KB_PATH, out);
  console.log(`kb.json ${before.length} -> ${out.length} bytes`);
}
