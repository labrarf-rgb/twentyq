import { resolveLog } from "./learn";
import type { Category, EngineConstants, KB, LogGame, Value } from "./types";

/** Value codes used in the dense matrix; also the column order of `lik`. */
export const V_YES = 0;
export const V_MAYBE = 1;
export const V_NO = 2;
export const V_UNKNOWN = 3;
const VALUE_ORDER: Value[] = ["yes", "maybe", "no", "unknown"];

/** The default for `engine.learnPriorStrength` when a (pre-v9) KB does not carry it. */
export const DEFAULT_LEARN_PRIOR = 2;

/** One thing the engine can guess: a KB thing, or (after the KB things) a learned one. */
export interface ThingInfo {
  id: string;
  name: string;
  article: string;
  learned: boolean;
  /** v9: guess line keeps the name exactly as written */
  proper?: boolean;
}

/** A KB (plus the game log's learning, v9) with everything flattened into matrices. */
export interface CompiledKB {
  kb: KB;
  /** All things: KB things first, then learned things. */
  N: number;
  /** KB things only. Indices >= nKb are learned things. */
  nKb: number;
  Q: number;
  /** values[i * Q + q] is V_YES | V_MAYBE | V_NO | V_UNKNOWN. Unlisted pairs are no. Learned rows are all no. */
  values: Uint8Array;
  /** cats[i * 3 + c] is cv(i, c): V_YES | V_MAYBE | V_NO, or V_NO for a learned thing. */
  cats: Uint8Array;
  /** lik[a][v] for a in yes, maybe, no (0..2) and v a value code. */
  lik: number[][];
  /** P(i, q, a) = P[a][q * N + i]: the answer probability of SPECS 11.2. Equals lik[a][values] exactly when nothing is learned. */
  P: Float64Array[];
  /** The same for the three category questions: PC[a][c * N + i]. */
  PC: Float64Array[];
  /** Per thing index: id, name and article (learned things included). */
  things: ThingInfo[];
  c: EngineConstants;
  qIndex: Map<string, number>;
  /** thing id -> index, KB things and learned things ("learned:" + key). */
  tIndex: Map<string, number>;
}

export function compileKB(kb: KB, log: readonly LogGame[] = []): CompiledKB {
  const nKb = kb.things.length;
  const Q = kb.questions.length;
  const qIndex = new Map(kb.questions.map((q, i) => [q.id, i]));
  const { learned, games } = resolveLog(kb, log);
  const kbIndex = new Map(kb.things.map((t, i) => [t.id, i]));
  const N = nKb + learned.length;
  const things: ThingInfo[] = kb.things.map((t) => ({ id: t.id, name: t.name, article: t.article, learned: false, proper: t.proper === true }));
  for (const l of learned) things.push({ id: l.id, name: l.name, article: "", learned: true });
  const tIndex = new Map(things.map((t, i) => [t.id, i]));

  const values = new Uint8Array(N * Q).fill(V_NO);
  // A learned row of `values` / `cats` holds the `no` code only as a placeholder: its real base is the
  // borrowed mix computed below, and P is what the engine reads.
  const put = (i: number, ids: string[] | undefined, code: number) => {
    for (const id of ids ?? []) {
      const q = qIndex.get(id);
      if (q === undefined) throw new Error(`Unknown question id "${id}" on ${kb.things[i].id}`);
      values[i * Q + q] = code;
    }
  };
  kb.things.forEach((t, i) => {
    put(i, t.yes, V_YES);
    put(i, t.maybe, V_MAYBE);
    put(i, t.unknown, V_UNKNOWN);
  });
  const cats = new Uint8Array(N * 3).fill(V_NO);
  for (let i = 0; i < nKb; i++) for (let c = 0; c < 3; c++) cats[i * 3 + c] = categoryValue(kb, i, c);

  const L = kb.engine.likelihood;
  const lik = (["yes", "maybe", "no"] as const).map((a) => VALUE_ORDER.map((v) => L[a][v]));

  // Counts: column q (0..Q-1) for a question, Q + c for category question c; three answers each.
  const cols = Q + 3;
  const counts = new Int32Array(N * cols * 3);
  const colOf = (id: string): number => {
    if (id.startsWith("cat:")) {
      const c = kb.categories.indexOf(id.slice(4) as never);
      return c >= 0 && c < 3 ? Q + c : -1;
    }
    if (id.startsWith("guess:")) return -1;
    return qIndex.get(id) ?? -1;
  };
  for (const { thing, game } of games) {
    for (const t of game.turns) {
      const a = t.a === "yes" ? 0 : t.a === "maybe" ? 1 : t.a === "no" ? 2 : -1;
      if (a < 0) continue; // skip, right and wrong never count
      const col = typeof t.id === "string" ? colOf(t.id) : -1;
      if (col < 0) continue; // an id this KB no longer has
      counts[(thing * cols + col) * 3 + a] += 1;
    }
  }
  const K = kb.engine.learnPriorStrength ?? DEFAULT_LEARN_PRIOR;
  // A learned thing's base for each cell is the near-weighted mix of the KB things it resembled when it was
  // first taught (SPECS 11.2): b(a) = sum_k w_k * L[a][value(near_k)], in list order, weights renormalized
  // after dropping ids the KB no longer has. With nothing usable it is `no`, like an unlisted KB pair.
  const nearIdx: number[][] = [];
  const nearW: number[][] = [];
  for (const l of learned) {
    const idx: number[] = [];
    const ws: number[] = [];
    if (l.near) {
      for (const e of l.near) {
        if (!Array.isArray(e) || typeof e[0] !== "string" || typeof e[1] !== "number" || !(e[1] > 0)) continue;
        const k = kbIndex.get(e[0]);
        if (k === undefined) continue; // stale id: dropped
        idx.push(k);
        ws.push(e[1]);
      }
    }
    let sum = 0;
    for (let j = 0; j < ws.length; j++) sum += ws[j];
    if (!(sum > 0)) {
      idx.length = 0;
      ws.length = 0;
    } else for (let j = 0; j < ws.length; j++) ws[j] = ws[j] / sum;
    nearIdx.push(idx);
    nearW.push(ws);
  }
  const base = (a: number, i: number, col: number, v: number): number => {
    if (i < nKb) return lik[a][v];
    const idx = nearIdx[i - nKb];
    if (idx.length === 0) return lik[a][V_NO];
    const ws = nearW[i - nKb];
    let b = 0;
    for (let j = 0; j < idx.length; j++) b += ws[j] * lik[a][col < Q ? values[idx[j] * Q + col] : cats[idx[j] * 3 + (col - Q)]];
    return b;
  };
  const prob = (a: number, i: number, col: number, v: number): number => {
    const b = base(a, i, col, v);
    const o = (i * cols + col) * 3;
    const n = counts[o] + counts[o + 1] + counts[o + 2];
    if (n === 0) return b; // nothing learned here: exactly the table value, no arithmetic
    return (K * b + counts[o + a]) / (K + n);
  };
  const P = [0, 1, 2].map(() => new Float64Array(N * Q));
  const PC = [0, 1, 2].map(() => new Float64Array(N * 3));
  for (let a = 0; a < 3; a++) {
    for (let q = 0; q < Q; q++) for (let i = 0; i < N; i++) P[a][q * N + i] = prob(a, i, q, values[i * Q + q]);
    for (let c = 0; c < 3; c++) for (let i = 0; i < N; i++) PC[a][c * N + i] = prob(a, i, Q + c, cats[i * 3 + c]);
  }
  return { kb, N, nKb, Q, values, cats, lik, P, PC, things, c: kb.engine, qIndex, tIndex };
}

/** v7: the category questions, in the order they are asked. */
export const CATEGORY_ORDER = 3; // animal, vegetable, mineral: kb.categories[0..2]

/** cv(i, c): yes if the thing is in category c, maybe if c is one of its altCategories, else no. */
export function categoryValue(kb: KB, thingIndex: number, c: number): number {
  const t = kb.things[thingIndex];
  const id = kb.categories[c];
  if (t.category === id) return V_YES;
  if (t.altCategories?.includes(id)) return V_MAYBE;
  return V_NO;
}

export function valueName(code: number): Value {
  return VALUE_ORDER[code];
}

/** "I think it's " article rule from SPECS §3: only the first letter is lowercased. */
export function thingPhrase(t: { name: string; article: string; learned?: boolean; proper?: boolean }): string {
  // v9: a learned thing is shown exactly as the player typed it, with no article added and no lowercasing.
  if (t.learned) return t.name;
  // v9: a proper name keeps its capitals ("the Easter Bunny"); everything else lowercases the first letter only.
  const name = t.proper ? t.name : t.name.charAt(0).toLowerCase() + t.name.slice(1);
  return (t.article ? t.article + " " : "") + name;
}

export function isCategory(kb: KB, s: string): s is Category {
  return (kb.categories as string[]).includes(s);
}
