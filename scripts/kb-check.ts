// npm run kb:check: validator from SPECS §3. Exits 1 on any error, warns otherwise.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KB_PATH = fileURLToPath(new URL("../kb/kb.json", import.meta.url));

const ARTICLES = ["a", "an", "the", ""];
/** [if this is yes, then this must also be yes] */
const IMPLIES: [string, string][] = [
  ["bigger_than_car", "bigger_than_breadbox"],
  ["has_four_legs", "has_legs"],
  ...["is_mammal", "is_bird", "is_fish", "is_reptile", "is_insect"].map((q): [string, string] => [q, "is_alive"]),
  ...["is_fruit", "is_vegetable_food", "is_drink"].map((q): [string, string] => [q, "is_food"]),
  ["has_screen", "uses_electricity"],
];
const CONTRADICTIONS: [string, string][] = [["can_hold", "bigger_than_breadbox"]];

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

type Raw = any;

export function checkKB(kb: Raw): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);

  if (kb?.schemaVersion !== 1) err(`schemaVersion must be 1 (got ${JSON.stringify(kb?.schemaVersion)})`);
  if (!Array.isArray(kb?.questions) || !Array.isArray(kb?.things) || !Array.isArray(kb?.categories)) {
    err("questions, things and categories must be arrays");
    return { errors, warnings };
  }

  const categories: string[] = kb.categories;
  const qIds = new Set<string>();
  for (const q of kb.questions) {
    if (qIds.has(q.id)) err(`duplicate question id "${q.id}"`);
    qIds.add(q.id);
    if (!q.text || !q.group) err(`question "${q.id}" needs text and group`);
  }

  const tIds = new Set<string>();
  const tNames = new Set<string>();
  const valueOf = new Map<string, Map<string, string>>(); // thing id -> question id -> value

  for (const t of kb.things) {
    if (tIds.has(t.id)) err(`duplicate thing id "${t.id}"`);
    tIds.add(t.id);
    const lname = String(t.name).toLowerCase();
    if (tNames.has(lname)) err(`duplicate thing name "${t.name}"`);
    tNames.add(lname);
    if (!categories.includes(t.category)) err(`${t.id}: invalid category "${t.category}"`);
    for (const c of t.altCategories ?? []) {
      if (!categories.includes(c)) err(`${t.id}: invalid altCategories entry "${c}"`);
      if (c === t.category) err(`${t.id}: altCategories repeats its own category "${c}"`);
    }
    if (!ARTICLES.includes(t.article)) err(`${t.id}: invalid article ${JSON.stringify(t.article)}`);

    const vals = new Map<string, string>();
    for (const list of ["yes", "maybe", "unknown"] as const) {
      for (const q of t[list] ?? []) {
        if (!qIds.has(q)) err(`${t.id}: unknown question id "${q}" in ${list}`);
        else if (vals.has(q)) err(`${t.id}: question "${q}" appears in both ${vals.get(q)} and ${list} (or twice)`);
        vals.set(q, list);
      }
    }
    valueOf.set(t.id, vals);
  }

  const val = (tid: string, q: string) => valueOf.get(tid)?.get(q) ?? "no";

  for (const t of kb.things) {
    for (const [a, b] of IMPLIES) {
      if (val(t.id, a) === "yes" && val(t.id, b) !== "yes") err(`${t.id}: ${a}=yes implies ${b}=yes (it is ${val(t.id, b)})`);
    }
    for (const [a, b] of CONTRADICTIONS) {
      if (val(t.id, a) === "yes" && val(t.id, b) === "yes") err(`${t.id}: ${a} and ${b} are both yes`);
    }
  }

  // Pairwise distance over full answer vectors.
  const qList: string[] = kb.questions.map((q: Raw) => q.id);
  const vec = (tid: string) => qList.map((q) => val(tid, q));
  const vecs = kb.things.map((t: Raw) => vec(t.id));
  for (let i = 0; i < kb.things.length; i++) {
    for (let j = i + 1; j < kb.things.length; j++) {
      let d = 0;
      for (let q = 0; q < qList.length; q++) if (vecs[i][q] !== vecs[j][q]) d++;
      const label = `${kb.things[i].id} / ${kb.things[j].id}`;
      if (d === 0) err(`indistinguishable pair: ${label}`);
      else if (d < 3) warn(`pair differs on only ${d} question(s): ${label}`);
    }
  }

  const N = kb.things.length;
  qList.forEach((q, qi) => {
    const counts: Record<string, number> = {};
    for (const v of vecs) counts[v[qi]] = (counts[v[qi]] ?? 0) + 1;
    const [topVal, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (n / N >= 0.95) warn(`question "${q}" is ${topVal} for ${n}/${N} things (>= 95%)`);
  });

  for (const t of kb.things) {
    if ((t.yes ?? []).length < 6) warn(`${t.id} has only ${(t.yes ?? []).length} yes entries (< 6)`);
  }

  return { errors, warnings };
}

function main() {
  let kb: Raw;
  try {
    kb = JSON.parse(readFileSync(KB_PATH, "utf8"));
  } catch (e) {
    console.error(`✗ kb.json is not valid JSON: ${(e as Error).message}`);
    process.exit(1);
  }
  const { errors, warnings } = checkKB(kb);
  for (const w of warnings) console.warn(`warn  ${w}`);
  for (const e of errors) console.error(`error ${e}`);
  console.log(
    `${kb.kbVersion}: ${kb.things?.length} things, ${kb.questions?.length} questions · ${errors.length} error(s), ${warnings.length} warning(s)`,
  );
  if (errors.length) process.exit(1);
  console.log("✓ kb:check passed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
