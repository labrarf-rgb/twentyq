import { categoryValue, CATEGORY_ORDER, compileKB, type CompiledKB } from "./kb";
import { mulberry32 } from "./rng";
import type {
  AnswerToken,
  CurrentTurn,
  GameView,
  KB,
  Outcome,
  RecapEntry,
} from "./types";

/** yes, maybe, no -> row of the likelihood table; skip -> -1 (no weight change). */
const ANSWER_INDEX: Record<string, number | undefined> = { yes: 0, maybe: 1, no: 2, skip: -1 };

/** Two gains closer than this are tied (SPECS §4): absorbs last-ulp float differences. */
export const TIE_EPSILON = 1e-9;

/** H(p) = -sum p ln p over p > 0, summed in index order. */
function entropy(p: ArrayLike<number>): number {
  let h = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] > 0) h -= p[i] * Math.log(p[i]);
  }
  return h;
}

/**
 * One game in progress. Mutable and incremental; `replay` below builds one from an
 * answer history, which is how the UI implements Back (SPECS §4).
 */
export class Session {
  readonly w: Float64Array;
  readonly asked = new Set<number>();
  readonly guessed = new Set<number>();
  readonly entries: RecapEntry[] = [];
  current: CurrentTurn | null;
  result: Outcome | null = null;
  private readonly rng: () => number;

  constructor(
    readonly ckb: CompiledKB,
    seed: number,
  ) {
    this.w = new Float64Array(ckb.N).fill(1 / ckb.N);
    this.rng = mulberry32(seed);
    this.current = { turn: 1, kind: "category", cat: 0 };
  }

  /** Apply the player's answer to the current turn and advance. */
  apply(answer: AnswerToken): void {
    const cur = this.current;
    if (!cur) throw new Error("Game is over");
    const { ckb, w } = this;
    const { kb, c } = ckb;

    if (cur.kind === "category") {
      // v7: a category question is scored like a normal question, with cv(i, c) as the value.
      const a = ANSWER_INDEX[answer];
      if (a === undefined) throw new Error(`Bad category answer "${answer}"`);
      if (a >= 0) {
        for (let i = 0; i < ckb.N; i++) w[i] *= ckb.lik[a][categoryValue(kb, i, cur.cat)];
        this.normalize();
      }
      this.entries.push({ turn: cur.turn, kind: "category", id: kb.categories[cur.cat], answer });
      // YES settles the category and UNKNOWN stops asking; NO or SOMETIMES moves on, until mineral.
      if (!this.result && (answer === "yes" || answer === "skip" || cur.cat + 1 >= CATEGORY_ORDER)) {
        this.current = this.decide(cur.turn + 1);
      } else if (!this.result) {
        this.current = { turn: cur.turn + 1, kind: "category", cat: cur.cat + 1 };
      }
      return;
    } else if (cur.kind === "question") {
      let a: number;
      if (answer === "yes") a = 0;
      else if (answer === "maybe") a = 1;
      else if (answer === "no") a = 2;
      else if (answer === "skip") a = -1;
      else throw new Error(`Bad question answer "${answer}"`);
      if (a >= 0) {
        for (let i = 0; i < ckb.N; i++) w[i] *= ckb.lik[a][ckb.values[i * ckb.Q + cur.q]];
        this.normalize();
      }
      this.entries.push({ turn: cur.turn, kind: "question", id: kb.questions[cur.q].id, answer });
    } else {
      if (answer !== "right" && answer !== "wrong") throw new Error(`Bad guess answer "${answer}"`);
      this.entries.push({ turn: cur.turn, kind: "guess", id: kb.things[cur.thing].id, answer });
      if (answer === "right") {
        this.finish("win", cur.turn);
        return;
      }
      w[cur.thing] = 0;
      this.guessed.add(cur.thing);
      this.normalize();
      if (this.result) return;
      if (cur.turn >= c.maxTurns) {
        this.finish("stumped", cur.turn);
        return;
      }
    }
    if (this.result) return;
    this.current = this.decide(cur.turn + 1);
  }

  /** Normalize in index order; a zero sum ends the game as stumped. */
  private normalize(): void {
    const { w } = this;
    let s = 0;
    for (let i = 0; i < w.length; i++) s += w[i];
    if (s === 0) {
      this.finish("stumped", this.current!.turn);
      return;
    }
    for (let i = 0; i < w.length; i++) w[i] = w[i] / s;
  }

  private finish(outcome: Outcome["outcome"], turn: number): void {
    this.result = { outcome, turn };
    this.current = null;
  }

  /** Index of the highest weight; ties go to the lowest index. */
  topThing(): number {
    let top = 0;
    for (let i = 1; i < this.w.length; i++) if (this.w[i] > this.w[top]) top = i;
    return top;
  }

  /** Decide what turn t (>= 2) is. */
  private decide(t: number): CurrentTurn {
    const { c } = this.ckb;
    const top = this.topThing();
    if (t >= c.forceGuessTurn) return { turn: t, kind: "guess", thing: top };
    if (t >= c.guessMinTurn && this.w[top] >= c.guessConfidence) return { turn: t, kind: "guess", thing: top };
    if (this.asked.size >= this.ckb.Q) return { turn: t, kind: "guess", thing: top };
    const q = this.chooseQuestion();
    this.asked.add(q);
    return { turn: t, kind: "question", q };
  }

  /** Information gain of asking q, from the current weights (Skip excluded). */
  private gain(q: number, hw: number, u: Float64Array): number {
    const { ckb, w } = this;
    const { N, Q, values, lik } = ckb;
    let e = 0;
    for (let a = 0; a < 3; a++) {
      let pa = 0;
      for (let i = 0; i < N; i++) {
        const x = w[i] * lik[a][values[i * Q + q]];
        u[i] = x;
        pa += x;
      }
      if (pa > 0) {
        for (let i = 0; i < N; i++) u[i] = u[i] / pa;
        e += pa * entropy(u);
      }
    }
    return hw - e;
  }

  /**
   * Rank unasked questions by gain (ties within TIE_EPSILON go to the lower index),
   * take the top k, and pick rank floor(r * k) with exactly one RNG draw.
   *
   * Ranking is a selection scan rather than a comparator sort, so the result never
   * depends on the sort algorithm: a candidate displaces the current best only if its
   * gain is higher by more than TIE_EPSILON, scanning in index order.
   */
  private chooseQuestion(): number {
    const { ckb, w } = this;
    const hw = entropy(w);
    const u = new Float64Array(ckb.N);
    const cand: number[] = [];
    const gains: number[] = [];
    for (let q = 0; q < ckb.Q; q++) {
      if (this.asked.has(q)) continue;
      cand.push(q);
      gains.push(this.gain(q, hw, u));
    }
    const k = Math.min(ckb.c.topK, cand.length);
    const ranked: number[] = [];
    const taken = new Set<number>();
    for (let r = 0; r < k; r++) {
      let best = -1;
      for (let j = 0; j < cand.length; j++) {
        if (taken.has(j)) continue;
        if (best < 0 || gains[j] > gains[best] + TIE_EPSILON) best = j;
      }
      taken.add(best);
      ranked.push(cand[best]);
    }
    const pick = Math.floor(this.rng() * k);
    return ranked[pick];
  }

  view(): GameView {
    return {
      current: this.current,
      result: this.result,
      entries: this.entries,
      weights: this.w,
      guessed: this.guessed,
      runnerUps: this.topN(this.ckb.c.topK, true),
    };
  }

  /** Top n thing indices by weight, ties to the lower index. */
  topN(n: number, excludeGuessed = false): number[] {
    const idx: number[] = [];
    for (let i = 0; i < this.w.length; i++) if (!(excludeGuessed && this.guessed.has(i))) idx.push(i);
    idx.sort((a, b) => this.w[b] - this.w[a] || a - b);
    return idx.slice(0, n);
  }
}

/** Build the state after `answers` (no `back` tokens: Back is just dropping the last answer). */
export function replay(kb: KB | CompiledKB, seed: number, answers: readonly AnswerToken[]): Session {
  const ckb = "values" in kb ? kb : compileKB(kb);
  const s = new Session(ckb, seed);
  for (const a of answers) s.apply(a);
  return s;
}

/** Resolve a token list that may contain `back` into a plain answer history. */
export function applyBacks(tokens: readonly (AnswerToken | "back")[]): AnswerToken[] {
  const out: AnswerToken[] = [];
  for (const t of tokens) {
    if (t === "back") out.pop();
    else out.push(t);
  }
  return out;
}
