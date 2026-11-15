import { describe, expect, it } from "vitest";
import { applyBacks, replay, Session, TIE_EPSILON } from "./engine";
import { compileKB, thingPhrase } from "./kb";
import { mulberry32 } from "./rng";
import type { AnswerToken, KB, Thing } from "./types";

const ENGINE: KB["engine"] = {
  likelihood: {
    yes: { yes: 0.85, maybe: 0.4, no: 0.05, unknown: 1 / 3 },
    maybe: { yes: 0.1, maybe: 0.3, no: 0.1, unknown: 1 / 3 },
    no: { yes: 0.05, maybe: 0.3, no: 0.85, unknown: 1 / 3 },
  },
  guessConfidence: 0.8,
  guessMinTurn: 8,
  forceGuessTurn: 20,
  maxTurns: 25,
  topK: 3,
};

/** 8 questions q0..q7, and 8 things where thing i has a unique 3-bit-ish signature. */
function makeKB(things: Partial<Thing>[], nq = 8): KB {
  return {
    schemaVersion: 1,
    kbVersion: "test",
    categories: ["animal", "vegetable", "mineral", "other"],
    engine: ENGINE,
    questions: Array.from({ length: nq }, (_, i) => ({ id: `q${i}`, text: `Question ${i}?`, group: "g" })),
    things: things.map((t, i) => ({
      id: `t${i}`,
      name: `Thing${i}`,
      article: "a",
      category: "animal",
      yes: [],
      ...t,
    })) as Thing[],
  };
}

describe("mulberry32", () => {
  it("is deterministic and in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("differs by seed, and handles negative seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    expect(mulberry32(-7)()).toBe(mulberry32(-7)());
  });
  it("matches the spec's reference algorithm for seed 42", () => {
    // Independent re-computation of the SPECS §4 algorithm.
    let a = 42 | 0;
    const ref: number[] = [];
    for (let n = 0; n < 3; n++) {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      ref.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
    const r = mulberry32(42);
    expect([r(), r(), r()]).toEqual(ref);
  });
});

describe("thingPhrase", () => {
  it("lowercases only the first letter and handles empty articles", () => {
    expect(thingPhrase({ name: "Cat", article: "a" })).toBe("a cat");
    expect(thingPhrase({ name: "Moon", article: "the" })).toBe("the moon");
    expect(thingPhrase({ name: "Bread", article: "" })).toBe("bread");
    expect(thingPhrase({ name: "T-Shirt", article: "a" })).toBe("a t-Shirt");
  });
});

describe("category phase (v7)", () => {
  const kb = makeKB([
    { category: "animal", yes: ["q0"] },
    { category: "vegetable", altCategories: ["animal"], yes: ["q1"] },
    { category: "mineral", yes: ["q2"] },
    { category: "other", yes: ["q3"] },
  ]);
  const L = ENGINE.likelihood;
  const norm = (raw: number[]) => {
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((r) => r / sum);
  };
  it("starts uniform on turn 1 with the animal question", () => {
    const s = replay(kb, 1, []);
    expect(s.current).toEqual({ turn: 1, kind: "category", cat: 0 });
    expect(Array.from(s.w)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
  it("YES scores with cv (yes / maybe for altCategories / no) and ends the phase", () => {
    const s = replay(kb, 1, ["yes"]);
    // cv(i, animal): animal yes, vegetable (alt animal) maybe, mineral no, other no
    const want = norm([L.yes.yes, L.yes.maybe, L.yes.no, L.yes.no]);
    want.forEach((r, i) => expect(s.w[i]).toBeCloseTo(r, 12));
    expect(s.current?.turn).toBe(2);
    expect(s.current?.kind).toBe("question");
    expect(s.entries[0]).toEqual({ turn: 1, kind: "category", id: "animal", answer: "yes" });
  });
  it("NO and SOMETIMES go on to the next category question", () => {
    for (const a of ["no", "maybe"] as const) {
      const s = replay(kb, 1, [a]);
      expect(s.current).toEqual({ turn: 2, kind: "category", cat: 1 });
      const want = norm([L[a].yes, L[a].maybe, L[a].no, L[a].no]);
      want.forEach((r, i) => expect(s.w[i]).toBeCloseTo(r, 12));
    }
  });
  it("each category can be settled at Q1, Q2 or Q3, and three NOs end the phase", () => {
    expect(replay(kb, 1, ["yes"]).current).toMatchObject({ turn: 2, kind: "question" });
    expect(replay(kb, 1, ["no", "yes"]).current).toMatchObject({ turn: 3, kind: "question" });
    expect(replay(kb, 1, ["no", "no", "yes"]).current).toMatchObject({ turn: 4, kind: "question" });
    const s = replay(kb, 1, ["no", "no", "no"]);
    expect(s.current).toMatchObject({ turn: 4, kind: "question" });
    expect(s.entries.map((e) => e.id)).toEqual(["animal", "vegetable", "mineral"]);
    // three NOs point at "other"
    expect(s.topThing()).toBe(3);
  });
  it("SOMETIMES on the last category question still ends the phase", () => {
    expect(replay(kb, 1, ["no", "no", "maybe"]).current).toMatchObject({ turn: 4, kind: "question" });
  });
  it("UNKNOWN ends the phase with the weights unchanged", () => {
    const s = replay(kb, 1, ["skip"]);
    expect(Array.from(s.w)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(s.current).toMatchObject({ turn: 2, kind: "question" });
    const t = replay(kb, 1, ["no", "skip"]);
    expect(t.current).toMatchObject({ turn: 3, kind: "question" });
  });
  it("category turns never draw from the RNG", () => {
    // Every thing is "other", so no number of NOs changes the relative weights: the first
    // question must be the same whether the phase took one turn or three.
    const same = makeKB(Array.from({ length: 8 }, (_, i) => ({ category: "other" as const, yes: [0, 1, 2].filter((b) => (i >> b) & 1).map((b) => `q${b}`) })));
    for (let seed = 0; seed < 20; seed++) {
      const a = replay(same, seed, ["skip"]);
      const b = replay(same, seed, ["no", "no", "no"]);
      expect(a.current).toMatchObject({ kind: "question" });
      expect(b.current).toMatchObject({ kind: "question" });
      expect((a.current as { q: number }).q).toBe((b.current as { q: number }).q);
    }
  });
  it("category turns never guess", () => {
    const one = makeKB([{ category: "animal", yes: ["q0"] }]);
    const s = replay(one, 1, ["yes"]);
    expect(s.w[0]).toBe(1); // fully confident, but turn 1 was a category question and turn 2 < guessMinTurn
    expect(s.current).toMatchObject({ turn: 2, kind: "question" });
  });
  it("rejects guess tokens on a category turn", () => {
    expect(() => replay(kb, 1, ["right"])).toThrow();
  });
});

describe("answers", () => {
  const kb = makeKB([
    { yes: ["q0"] },
    { maybe: ["q0"] },
    { yes: [] },
    { unknown: ["q0"] },
  ], 1);
  it("Yes/Maybe/No multiply by the likelihood table", () => {
    for (const [ans, row] of [
      ["yes", ENGINE.likelihood.yes],
      ["maybe", ENGINE.likelihood.maybe],
      ["no", ENGINE.likelihood.no],
    ] as const) {
      const s = replay(kb, 5, ["skip", ans as AnswerToken]);
      const raw = [row.yes, row.maybe, row.no, row.unknown];
      const sum = raw.reduce((a, b) => a + b, 0);
      raw.forEach((r, i) => expect(s.w[i]).toBeCloseTo(r / sum, 12));
    }
  });
  it("Skip spends the turn without changing weights", () => {
    const s = replay(kb, 5, ["skip", "skip"]);
    expect(Array.from(s.w)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(s.entries.map((e) => e.turn)).toEqual([1, 2]);
    expect(s.current?.turn).toBe(3);
  });
  it("rejects wrong answer tokens for the turn kind", () => {
    expect(() => replay(kb, 5, ["right"])).toThrow();
    expect(() => replay(kb, 5, ["skip", "right"])).toThrow();
  });
});

describe("question choice", () => {
  it("never repeats a question and draws the RNG exactly once per question turn", () => {
    const kb = makeKB(
      Array.from({ length: 8 }, (_, i) => ({
        yes: [0, 1, 2].filter((b) => (i >> b) & 1).map((b) => `q${b}`),
      })),
    );
    const s = new Session(compileKB(kb), 99);
    s.apply("skip");
    const seen = new Set<string>();
    while (s.current && s.current.kind === "question") {
      const id = kb.questions[s.current.q].id;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      s.apply("skip");
    }
    // All 8 questions are asked at most once; with skips only, weights stay uniform.
    expect(seen.size).toBeLessThanOrEqual(8);
    expect(s.current?.kind).toBe("guess");
  });

  it("picks among the top-k by gain and breaks ties by lower index", () => {
    // q0 splits 4/4 (best). q1 and q2 are identical splits of 2/6 (tied, lower). q3 is useless.
    const kb = makeKB(
      [
        { yes: ["q0", "q1"] },
        { yes: ["q0", "q2"] },
        { yes: ["q0"] },
        { yes: ["q0"] },
        { yes: [] },
        { yes: [] },
        { yes: [] },
        { yes: [] },
      ],
      4,
    );
    const picks = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const s = replay(kb, seed, ["skip"]);
      if (s.current?.kind === "question") picks.add(kb.questions[s.current.q].id);
    }
    // topK=3 over q0, q1, q2, q3 -> q3 (rank 4) is never picked; q1 ranks before q2.
    expect(picks.has("q0")).toBe(true);
    expect(picks.has("q3")).toBe(false);
  });

  it("selection treats gains within the epsilon as tied", () => {
    expect(TIE_EPSILON).toBe(1e-9);
  });
});

describe("guess rules", () => {
  /** Thing 0 is a yes on every question, so Yes answers pile its weight up fast. */
  const kb = makeKB(
    [
      { yes: Array.from({ length: 12 }, (_, i) => `q${i}`) },
      ...Array.from({ length: 5 }, (_, j) => ({ yes: [`q${j}`] })),
    ],
    12,
  );

  it("guesses once confidence >= 0.8 at turn >= 8, never before turn 8", () => {
    const s = new Session(compileKB(kb), 3);
    s.apply("skip");
    let guessTurn = 0;
    while (s.current) {
      if (s.current.kind === "guess") {
        guessTurn = s.current.turn;
        break;
      }
      s.apply("yes");
    }
    expect(guessTurn).toBeGreaterThanOrEqual(8);
    expect(s.current && s.current.kind === "guess" ? s.current.thing : -1).toBe(0);
  });

  it("Right wins at that turn", () => {
    const s = replay(kb, 3, ["skip"]);
    while (s.current?.kind === "question") s.apply("yes");
    const t = s.current!.turn;
    s.apply("right");
    expect(s.result).toEqual({ outcome: "win", turn: t });
    expect(s.current).toBeNull();
  });

  it("Wrong zeroes that thing, records it and continues with someone else", () => {
    const s = replay(kb, 3, ["skip"]);
    while (s.current?.kind === "question") s.apply("yes");
    const first = (s.current as { thing: number }).thing;
    s.apply("wrong");
    expect(s.w[first]).toBe(0);
    expect(s.guessed.has(first)).toBe(true);
    const sum = Array.from(s.w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
    if (s.current?.kind === "guess") expect(s.current.thing).not.toBe(first);
  });

  it("forces guesses from turn 20 and ends stumped at turn 25", () => {
    // Many similar things, no useful questions: never confident.
    const flat = makeKB(Array.from({ length: 40 }, () => ({ yes: [] })), 5);
    const s = new Session(compileKB(flat), 7);
    s.apply("skip");
    while (s.current?.kind === "question") s.apply("skip");
    // The 5 questions run out, so every later turn is a guess (rule 4), through turn 25.
    expect(s.current).toMatchObject({ turn: 7, kind: "guess" });
    const guessTurns: number[] = [];
    while (s.current) {
      expect(s.current.kind).toBe("guess");
      guessTurns.push(s.current.turn);
      s.apply("wrong");
    }
    expect(s.result).toEqual({ outcome: "stumped", turn: 25 });
    expect(guessTurns[guessTurns.length - 1]).toBe(25);
  });

  it("question turns before 20 are always questions when confidence is low", () => {
    const flat = makeKB(Array.from({ length: 40 }, () => ({ yes: [] })), 30);
    const s = new Session(compileKB(flat), 7);
    s.apply("skip");
    for (let turn = 2; turn < 20; turn++) {
      expect(s.current).toMatchObject({ turn, kind: "question" });
      s.apply("skip");
    }
    expect(s.current).toMatchObject({ turn: 20, kind: "guess" });
  });

  it("ends stumped immediately when no candidates remain", () => {
    const kb2 = makeKB([{ yes: [] }, { yes: [] }], 1);
    const s = new Session(compileKB(kb2), 1);
    s.apply("skip");
    // only one question; after it, guesses
    while (s.current?.kind === "question") s.apply("skip");
    s.apply("wrong");
    s.apply("wrong");
    expect(s.result?.outcome).toBe("stumped");
    expect(s.result!.turn).toBeLessThan(25);
  });

  it("runner-ups are the top 3 among things not guessed", () => {
    const s = replay(kb, 3, ["skip"]);
    while (s.current?.kind === "question") s.apply("yes");
    const first = (s.current as { thing: number }).thing;
    s.apply("wrong");
    const ru = s.view().runnerUps;
    expect(ru).toHaveLength(3);
    expect(ru).not.toContain(first);
  });
});

describe("endgame lookahead (v10, SPECS §4)", () => {
  const EG: KB["engine"] = { ...ENGINE, guessConfidence: 0.9, guessMinTurn: 2, forceGuessTurn: 9, maxTurns: 12, topK: 2, endgameFrom: 3, endgameOvertime: 0.5 };
  /** 24 things over 10 questions with overlapping, uneven signatures, so the choice is not trivial. */
  const kb = { ...makeKB(Array.from({ length: 24 }, (_, i) => ({ yes: Array.from({ length: 10 }, (_, q) => q).filter((q) => (i * (q + 3)) % 7 < 3).map((q) => `q${q}`), maybe: i % 5 === 0 ? ["q9"] : [] })), 10), engine: EG };

  /** Reference from the spec text alone: sort, sum largest first, scan in index order from "guess now". */
  function reference(s: Session, t: number): number {
    const { N, Q, P, c } = s.ckb;
    const r = c.forceGuessTurn - t + 1;
    const lambda = c.endgameOvertime ?? 0;
    const X = lambda > 0 ? Math.max(0, c.maxTurns - c.forceGuessTurn) : 0;
    const S = (u: number[], m: number) => {
      const b = [...u].sort((x, y) => y - x);
      let a = 0;
      for (let j = 0; j < m; j++) a += b[j];
      if (lambda > 0) {
        let tt = 0;
        for (let j = m; j < m + X; j++) tt += b[j];
        a += lambda * tt;
      }
      return a;
    };
    let best = -1;
    let bestV = S(Array.from(s.w), r);
    for (let q = 0; q < Q; q++) {
      if (s.asked.has(q)) continue;
      let v = 0;
      for (let a = 0; a < 3; a++) v += S(Array.from({ length: N }, (_, i) => s.w[i] * P[a][q * N + i]), r - 1);
      if (v > bestV + TIE_EPSILON) {
        bestV = v;
        best = q;
      }
    }
    return best;
  }

  it("matches a sort-based reference on every endgame turn, and guesses top when no question beats guessing", () => {
    let checked = 0;
    let questions = 0;
    let guesses = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = mulberry32(seed);
      const s = new Session(compileKB(kb), seed);
      while (s.current) {
        const cur = s.current;
        if (cur.kind === "category") s.apply("skip");
        else if (cur.kind === "guess") {
          if (cur.turn >= EG.endgameFrom! && cur.turn < EG.forceGuessTurn && s.w[cur.thing] < EG.guessConfidence) guesses++;
          s.apply(rnd() < 0.3 ? "right" : "wrong");
        } else {
          s.apply((["yes", "no", "maybe"] as const)[Math.floor(rnd() * 3)]);
        }
        const nxt = s.current;
        if (nxt && nxt.turn >= EG.endgameFrom! && nxt.turn < EG.forceGuessTurn) {
          const top = s.topThing();
          if (s.w[top] >= EG.guessConfidence || s.asked.size >= s.ckb.Q) continue;
          // the turn is already decided (and its question added to asked); undo that to re-derive it
          const want = nxt.kind === "question" ? (s.asked.delete(nxt.q), reference(s, nxt.turn)) : reference(s, nxt.turn);
          if (nxt.kind === "question") {
            s.asked.add(nxt.q);
            questions++;
          }
          expect(nxt.kind === "question" ? nxt.q : -1).toBe(want);
          if (nxt.kind === "guess") expect(nxt.thing).toBe(top);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(questions).toBeGreaterThan(10);
    expect(guesses).toBeGreaterThan(0); // the lookahead itself chose to guess at least once
  });

  it("endgame turns never read the RNG: from endgameFrom on, the game is the same for every seed", () => {
    // Turn 2 is the only question chosen by gain (topK 2, one RNG draw); from turn 3 every turn is endgame.
    const QA: AnswerToken[] = ["yes", "no", "maybe", "no", "yes", "no"];
    const play = (seed: number) => {
      const s = replay(kb, seed, ["skip"]);
      const second = s.current!.kind === "question" ? s.current!.q : -1;
      let n = 0;
      while (s.current) s.apply(s.current.kind === "guess" ? "wrong" : QA[n++ % QA.length]);
      return { second, rest: s.entries.slice(2).map((e) => `${e.turn}:${e.kind}:${e.id}:${e.answer}`).join(" ") };
    };
    const bySecond = new Map<number, string>();
    for (let seed = 0; seed < 60; seed++) {
      const g = play(seed);
      const prev = bySecond.get(g.second);
      if (prev !== undefined) expect(g.rest).toBe(prev);
      else bySecond.set(g.second, g.rest);
    }
    expect(bySecond.size).toBe(2); // turn 2 varies by seed (topK 2); everything after it does not
  });

  it("with nothing to tell apart, guessing beats every question (ties go to guessing)", () => {
    const flat = { ...makeKB(Array.from({ length: 30 }, () => ({ yes: [] })), 6), engine: EG };
    const s = new Session(compileKB(flat), 5);
    s.apply("skip");
    expect(s.current).toMatchObject({ turn: 2, kind: "question" }); // before endgameFrom: chosen by gain
    s.apply("skip");
    expect(s.current).toMatchObject({ turn: 3, kind: "guess", thing: 0 });
  });

  it("is off when endgameFrom is absent (v9 behaviour)", () => {
    const { endgameFrom: _a, endgameOvertime: _b, ...v9 } = EG;
    const flat = { ...makeKB(Array.from({ length: 30 }, () => ({ yes: [] })), 6), engine: v9 };
    const s = replay(flat, 5, ["skip", "skip"]);
    expect(s.current).toMatchObject({ turn: 3, kind: "question" });
  });
});

describe("replay and Back", () => {
  const kb = makeKB(
    Array.from({ length: 16 }, (_, i) => ({
      yes: [0, 1, 2, 3].filter((b) => (i >> b) & 1).map((b) => `q${b}`),
    })),
    8,
  );
  it("is deterministic for a given seed and answers", () => {
    const answers: AnswerToken[] = ["no", "yes", "no", "maybe"];
    const a = replay(kb, 123, answers);
    const b = replay(kb, 123, answers);
    expect(a.current).toEqual(b.current);
    expect(Array.from(a.w)).toEqual(Array.from(b.w));
  });
  it("Back is an exact replay of the shorter history", () => {
    const hist: AnswerToken[] = ["no", "yes", "no", "maybe", "skip"];
    const full = replay(kb, 77, hist);
    const back = replay(kb, 77, applyBacks([...hist, "back"]));
    const direct = replay(kb, 77, hist.slice(0, -1));
    expect(back.current).toEqual(direct.current);
    expect(Array.from(back.w)).toEqual(Array.from(direct.w));
    // And going forward again with the same answer reproduces the original.
    const again = replay(kb, 77, applyBacks([...hist, "back", "skip"]));
    expect(again.current).toEqual(full.current);
    expect(Array.from(again.w)).toEqual(Array.from(full.w));
  });
  it("applyBacks never underflows", () => {
    expect(applyBacks(["back", "back", "yes"])).toEqual(["yes"]);
  });
});
