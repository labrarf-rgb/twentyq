import type { Category, EngineConstants, KB, Value } from "./types";

/** Value codes used in the dense matrix; also the column order of `lik`. */
export const V_YES = 0;
export const V_MAYBE = 1;
export const V_NO = 2;
export const V_UNKNOWN = 3;
const VALUE_ORDER: Value[] = ["yes", "maybe", "no", "unknown"];

/** A KB with its (thing, question) values flattened into a matrix. */
export interface CompiledKB {
  kb: KB;
  N: number;
  Q: number;
  /** values[i * Q + q] is V_YES | V_MAYBE | V_NO | V_UNKNOWN. Unlisted pairs are no. */
  values: Uint8Array;
  /** lik[a][v] for a in yes, maybe, no (0..2) and v a value code. */
  lik: number[][];
  c: EngineConstants;
  qIndex: Map<string, number>;
  tIndex: Map<string, number>;
}

export function compileKB(kb: KB): CompiledKB {
  const N = kb.things.length;
  const Q = kb.questions.length;
  const qIndex = new Map(kb.questions.map((q, i) => [q.id, i]));
  const tIndex = new Map(kb.things.map((t, i) => [t.id, i]));
  const values = new Uint8Array(N * Q).fill(V_NO);
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
  const L = kb.engine.likelihood;
  const lik = (["yes", "maybe", "no"] as const).map((a) => VALUE_ORDER.map((v) => L[a][v]));
  return { kb, N, Q, values, lik, c: kb.engine, qIndex, tIndex };
}

export function valueName(code: number): Value {
  return VALUE_ORDER[code];
}

/** "I think it's " article rule from SPECS §3: only the first letter is lowercased. */
export function thingPhrase(t: { name: string; article: string }): string {
  const name = t.name.charAt(0).toLowerCase() + t.name.slice(1);
  return (t.article ? t.article + " " : "") + name;
}

export function isCategory(kb: KB, s: string): s is Category {
  return (kb.categories as string[]).includes(s);
}
