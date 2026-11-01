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
    const games: { answers: string[]; result: { outcome: string; turn: number } }[] = vectors.games;
    expect(games.length).toBeGreaterThanOrEqual(12);
    for (const c of kb.categories) expect(games.some((g) => g.answers[0] === c)).toBe(true);
    expect(games.some((g) => g.answers[0] === "skip")).toBe(true);
    expect(games.some((g) => g.answers.filter((a) => a === "back").length >= 3)).toBe(true);
    expect(games.some((g) => g.result.outcome === "stumped" && g.result.turn === 25)).toBe(true);
  });

  it.each(vectors.prng)("mulberry32($seed) matches", ({ seed, first }) => {
    const r = mulberry32(seed);
    expect(first).toHaveLength(10);
    first.forEach((x) => expect(r()).toBe(x));
  });

  it.each(vectors.games)("game $name replays exactly", (g) => {
    const s = replay(ckb, g.seed, applyBacks(g.answers as (AnswerToken | "back")[]));
    const turns = s.entries.map((e) => ({ turn: e.turn, kind: e.kind, ...(e.id ? { id: e.id } : {}) }));
    if (s.current) {
      const c = s.current;
      turns.push(
        c.kind === "category"
          ? { turn: c.turn, kind: c.kind }
          : { turn: c.turn, kind: c.kind, id: c.kind === "question" ? kb.questions[c.q].id : kb.things[c.thing].id },
      );
    }
    expect(turns).toEqual(g.expect);
    expect(s.result).toEqual(g.result);
    const top = s.topN(3).map((i) => [kb.things[i].id, s.w[i]]);
    expect(top.map((t) => t[0])).toEqual(g.finalWeightsTop3.map((t: [string, number]) => t[0]));
    top.forEach((t, i) => expect(Math.abs((t[1] as number) - g.finalWeightsTop3[i][1])).toBeLessThan(1e-9));
  });
});
