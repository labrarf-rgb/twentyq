import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyBacks, replay } from "./engine";
import { compileKB } from "./kb";
import { mulberry32 } from "./rng";
import type { AnswerToken, KB } from "./types";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const kb: KB = read("../../kb/kb.json");
const vectors: { kbVersion: string; prng: { seed: number; first: number[] }[]; games: any[] } = read("../../kb/test-vectors.json");
const ckb = compileKB(kb);

describe("test-vectors.json", () => {
  it("was built from the current kbVersion (run `npm run kb:vectors` if not)", () => {
    expect(vectors.kbVersion).toBe(kb.kbVersion);
  });

  it("has the coverage SPECS §5 requires", () => {
    const games: { answers: string[]; expect: { kind: string }[]; result: { outcome: string; turn: number } }[] = vectors.games;
    expect(games.length).toBeGreaterThanOrEqual(12);
    // v7: category questions are ordinary tokens; check the phase shapes the vectors must cover
    const phases = games.map((g) => {
      const a = g.answers.filter((x) => x !== "back");
      const n = g.expect.filter((e) => e.kind === "category").length;
      return a.slice(0, n);
    });
    expect(phases.some((p) => p[0] === "yes")).toBe(true); // settled at Q1
    expect(phases.some((p) => p[0] !== "yes" && p[1] === "yes")).toBe(true); // Q2
    expect(phases.some((p) => p.length === 3 && p[2] === "yes")).toBe(true); // Q3
    expect(phases.some((p) => p.length === 3 && p.every((x) => x === "no"))).toBe(true); // three NOs
    expect(phases.some((p) => p.includes("maybe"))).toBe(true);
    expect(phases.some((p) => p.includes("skip"))).toBe(true);
    expect(games.some((g) => g.answers.filter((a) => a === "back").length >= 3)).toBe(true);
    expect(games.some((g) => g.result.outcome === "stumped" && g.result.turn === 25)).toBe(true);
  });

  it.each(vectors.prng)("mulberry32($seed) matches", ({ seed, first }) => {
    const r = mulberry32(seed);
    expect(first).toHaveLength(10);
    first.forEach((x) => expect(r()).toBe(x));
  });

  it("has the v9 learned coverage SPECS 11.6 requires", () => {
    const learned = vectors.games.filter((g) => g.learned);
    expect(learned.length).toBeGreaterThanOrEqual(7);
    const byName = (n: string) => vectors.games.find((g) => g.name === n)!;
    // a game that guesses a learned thing by name
    expect(byName("learned-guesses-a-learned-thing").expect.some((e: any) => e.kind === "guess" && e.id === "learned:zorp")).toBe(true);
    // the same new thing named with different spelling and case: one learned thing per name
    expect(byName("learned-same-name-different-spelling").learnedThings.map((t: any) => t.id)).toEqual(["learned:blip frobnitz", "learned:zorp"]);
    // an id that is not in the KB, a null actual and an empty name are ignored
    const ign = byName("learned-ignores-unusable-games");
    expect(ign.learned.some((l: any) => l.actual === null)).toBe(true);
    expect(ign.learned.some((l: any) => l.actual?.id === "thing_that_is_not_in_the_kb")).toBe(true);
    expect(ign.learnedThings).toEqual([]);
    expect(ign.thingCount).toBe(kb.things.length);
    // `near`: a taught name carries it, and one log has a stale id in it (v9 borrowing)
    expect(byName("learned-borrows-from-near").learned.some((l: any) => Array.isArray(l.near) && l.near.length === 5)).toBe(true);
    const stale = byName("learned-near-with-a-stale-id");
    expect(stale.learned.some((l: any) => l.near?.some((n: [string, number]) => n[0] === "thing_gone_from_the_kb"))).toBe(true);
    expect(stale.learned.some((l: any) => l.near?.length === 1 && l.near[0][0] === "also_gone_from_the_kb")).toBe(true);
    // learned counts change the questions asked
    const plain = replay(ckb, byName("learned-changes-the-questions").seed, []);
    expect(plain.current).toBeTruthy();
    expect(learned.some((g) => g.name === "learned-changes-the-questions")).toBe(true);
  });

  it.each(vectors.games)("game $name replays exactly", (g) => {
    const lckb = compileKB(kb, g.learned ?? []);
    if (g.learned) {
      expect(lckb.N).toBe(g.thingCount);
      expect(lckb.things.slice(lckb.nKb).map((t) => ({ id: t.id, name: t.name }))).toEqual(g.learnedThings);
    }
    const s = replay(lckb, g.seed, applyBacks(g.answers as (AnswerToken | "back")[]));
    const turns = s.entries.map((e) => ({ turn: e.turn, kind: e.kind, id: e.id }));
    if (s.current) {
      const c = s.current;
      turns.push({
        turn: c.turn,
        kind: c.kind,
        id: c.kind === "category" ? kb.categories[c.cat] : c.kind === "question" ? kb.questions[c.q].id : lckb.things[c.thing].id,
      });
    }
    expect(turns).toEqual(g.expect);
    expect(s.result).toEqual(g.result);
    const top = s.topN(3).map((i) => [lckb.things[i].id, s.w[i]]);
    expect(top.map((t) => t[0])).toEqual(g.finalWeightsTop3.map((t: [string, number]) => t[0]));
    top.forEach((t, i) => expect(Math.abs((t[1] as number) - g.finalWeightsTop3[i][1])).toBeLessThan(1e-9));
  });
});
