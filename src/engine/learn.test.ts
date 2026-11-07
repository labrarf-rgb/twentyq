import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replay } from "./engine";
import { compileKB } from "./kb";
import { kbThingByName, normalizeName, resolveLog } from "./learn";
import { nearOf } from "./near";
import { thingPhrase } from "./kb";
import type { KB, LogGame, LogTurn } from "./types";

const kb: KB = JSON.parse(readFileSync(new URL("../../kb/kb.json", import.meta.url), "utf8"));

const game = (actual: LogGame["actual"], turns: LogTurn[], extra: Partial<LogGame> = {}): LogGame => ({
  ts: 1,
  kbVersion: "t",
  outcome: "stumped",
  turn: turns.length,
  turns,
  actual,
  ...extra,
});

describe("normalizeName", () => {
  it("lowercases, trims, collapses spaces and drops one leading article", () => {
    expect(normalizeName("  A   Big  Zorp ")).toBe("big zorp");
    expect(normalizeName("The Zorp")).toBe("zorp");
    expect(normalizeName("an apple pie")).toBe("apple pie");
    expect(normalizeName("A-frame")).toBe("a-frame");
    expect(normalizeName("Another")).toBe("another");
    expect(normalizeName("a a thing")).toBe("a thing"); // only one article goes
  });
});

describe("learning (SPECS 11.2)", () => {
  it("with an empty log, P is exactly the likelihood table (no arithmetic)", () => {
    const c = compileKB(kb, []);
    expect(c.N).toBe(kb.things.length);
    let bad = 0;
    for (let a = 0; a < 3; a++) {
      for (let q = 0; q < c.Q; q++) for (let i = 0; i < c.N; i++) if (c.P[a][q * c.N + i] !== c.lik[a][c.values[i * c.Q + q]]) bad++;
      for (let k = 0; k < 3; k++) for (let i = 0; i < c.N; i++) if (c.PC[a][k * c.N + i] !== c.lik[a][c.cats[i * 3 + k]]) bad++;
    }
    expect(bad).toBe(0);
  });

  it("blends counts into the prior: (K b + c_a) / (K + n)", () => {
    const cat = kb.things.findIndex((t) => t.id === "cat");
    const q = kb.questions.findIndex((x) => x.id === "can_fly");
    expect(kb.things[cat].yes).not.toContain("can_fly");
    const log = [game({ id: "cat" }, [{ id: "can_fly", a: "yes" }])];
    const c = compileKB(kb, log);
    const K = kb.engine.learnPriorStrength ?? 2;
    const b = (a: number) => c.lik[a][c.values[cat * c.Q + q]];
    expect(c.P[0][q * c.N + cat]).toBe((K * b(0) + 1) / (K + 1));
    expect(c.P[1][q * c.N + cat]).toBe((K * b(1) + 0) / (K + 1));
    expect(c.P[2][q * c.N + cat]).toBe((K * b(2) + 0) / (K + 1));
    // each column still sums to one
    expect(c.P[0][q * c.N + cat] + c.P[1][q * c.N + cat] + c.P[2][q * c.N + cat]).toBeCloseTo(1, 12);
    // other things are untouched
    expect(c.P[0][q * c.N + cat + 1]).toBe(c.lik[0][c.values[(cat + 1) * c.Q + q]]);
  });

  it("never counts skip, guess turns, unknown ids, or games with no usable actual", () => {
    const cat = kb.things.findIndex((t) => t.id === "cat");
    const base = compileKB(kb, []);
    const log = [
      game({ id: "cat" }, [{ id: "can_fly", a: "skip" }, { id: "guess:cat", a: "wrong" }, { id: "no_such_question", a: "yes" }, { id: "cat:nope", a: "yes" }]),
      game(null, [{ id: "can_fly", a: "yes" }]),
      game({ id: "not_in_the_kb_at_all" }, [{ id: "can_fly", a: "yes" }]),
      game({ name: "   " }, [{ id: "can_fly", a: "yes" }]),
    ];
    const c = compileKB(kb, log);
    expect(c.N).toBe(base.N);
    for (let a = 0; a < 3; a++) expect(Array.from(c.P[a])).toEqual(Array.from(base.P[a]));
    void cat;
  });

  it("counts category turns under cat:<id>", () => {
    const cat = kb.things.findIndex((t) => t.id === "cat");
    const log = [game({ id: "cat" }, [{ id: "cat:vegetable", a: "yes" }])]; // cat is an animal: cv = no
    const c = compileKB(kb, log);
    const K = kb.engine.learnPriorStrength ?? 2;
    expect(c.PC[0][1 * c.N + cat]).toBe((K * c.lik[0][2] + 1) / (K + 1));
  });

  it("appends learned things after the KB, one per normalized name, in order of first mention", () => {
    const log = [
      game({ name: "  A Zorp " }, [{ id: "can_fly", a: "yes" }]),
      game({ name: "Blip" }, [{ id: "can_fly", a: "no" }]),
      game({ name: "ZORP" }, [{ id: "can_fly", a: "yes" }]),
      game({ name: "the zorp" }, [{ id: "can_fly", a: "maybe" }]),
    ];
    const { learned } = resolveLog(kb, log);
    expect(learned.map((l) => [l.id, l.name])).toEqual([
      ["learned:zorp", "A Zorp"],
      ["learned:blip", "Blip"],
    ]);
    const c = compileKB(kb, log);
    expect(c.N).toBe(kb.things.length + 2);
    expect(c.nKb).toBe(kb.things.length);
    expect(c.things[kb.things.length]).toMatchObject({ id: "learned:zorp", learned: true });
    // learned things start as no everywhere except where counts say otherwise
    const zorp = kb.things.length;
    const q = kb.questions.findIndex((x) => x.id === "can_fly");
    const other = kb.questions.findIndex((x) => x.id === "is_alive");
    expect(c.P[0][other * c.N + zorp]).toBe(c.lik[0][2]);
    const K = kb.engine.learnPriorStrength ?? 2;
    expect(c.P[0][q * c.N + zorp]).toBe((K * c.lik[0][2] + 2) / (K + 3));
    expect(c.P[1][q * c.N + zorp]).toBe((K * c.lik[1][2] + 1) / (K + 3));
  });

  it("maps a name that matches a KB thing to that thing", () => {
    const c = compileKB(kb, [game({ name: "the Cat" }, [{ id: "can_fly", a: "yes" }])]);
    expect(c.N).toBe(kb.things.length);
    const cat = kb.things.findIndex((t) => t.id === "cat");
    const q = kb.questions.findIndex((x) => x.id === "can_fly");
    expect(c.P[0][q * c.N + cat]).not.toBe(c.lik[0][c.values[cat * c.Q + q]]);
  });

  it("a learned thing can be guessed, by name", () => {
    // A player thinking of "a zorp", which answers every question the way rain does.
    const base = compileKB(kb);
    const like = base.tIndex.get("rain")!;
    const playOnce = (c: ReturnType<typeof compileKB>, seed: number) => {
      const s = replay(c, seed, []);
      const zorp = c.tIndex.get("learned:zorp");
      while (s.current) {
        const cur = s.current;
        if (cur.kind === "guess") s.apply(cur.thing === zorp ? "right" : "wrong");
        else {
          const v = cur.kind === "category" ? c.cats[like * 3 + cur.cat] : c.values[like * c.Q + cur.q];
          s.apply(v === 0 ? "yes" : v === 1 ? "maybe" : v === 3 ? "skip" : "no");
        }
      }
      return s;
    };
    const asLog = (s: ReturnType<typeof replay>): LogGame =>
      game(
        { name: "a zorp" },
        s.entries.map((e) => ({ id: e.kind === "category" ? "cat:" + e.id : e.kind === "guess" ? "guess:" + e.id : e.id!, a: e.answer })),
      );
    const first = playOnce(base, 11);
    expect(first.result?.outcome).toBe("stumped"); // the KB has no zorp
    const log = [asLog(first), asLog(playOnce(base, 12))];
    const c = compileKB(kb, log);
    const again = playOnce(c, 13);
    expect(again.result?.outcome).toBe("win");
    expect(c.things[c.tIndex.get(again.entries[again.entries.length - 1].id!)!].name).toBe("a zorp");
  });
});

describe("borrowing from look-alikes (SPECS 11.2)", () => {
  const ix = (id: string) => kb.things.findIndex((t) => t.id === id);
  const qx = (id: string) => kb.questions.findIndex((x) => x.id === id);
  const named = (near: LogGame["near"], extra: Partial<LogGame> = {}) => game({ name: "Zorp" }, [], { near, ...extra });

  it("the base is the near-weighted mix of the look-alikes' answers, weights renormalized", () => {
    const c = compileKB(kb, [named([["cat", 3], ["dog", 1]])]);
    const z = c.nKb;
    const q = qx("has_fur");
    for (let a = 0; a < 3; a++) {
      const want = 0.75 * c.lik[a][c.values[ix("cat") * c.Q + q]] + 0.25 * c.lik[a][c.values[ix("dog") * c.Q + q]];
      expect(c.P[a][q * c.N + z]).toBe(want);
    }
    // category cells borrow cv the same way
    for (let a = 0; a < 3; a++) {
      const want = 0.75 * c.lik[a][c.cats[ix("cat") * 3 + 0]] + 0.25 * c.lik[a][c.cats[ix("dog") * 3 + 0]];
      expect(c.PC[a][0 * c.N + z]).toBe(want);
    }
  });

  it("drops stale ids, and falls back to no when nothing usable is left", () => {
    const stale = compileKB(kb, [named([["gone_from_kb", 0.7], ["cat", 0.3]])]);
    const alone = compileKB(kb, [named([["cat", 1]])]);
    const q = qx("can_fly");
    for (let a = 0; a < 3; a++) expect(stale.P[a][q * stale.N + stale.nKb]).toBe(alone.P[a][q * alone.N + alone.nKb]);
    for (const near of [undefined, [], [["gone_from_kb", 1]], [["cat", 0]], [["cat", -1]]] as LogGame["near"][]) {
      const c = compileKB(kb, [named(near)]);
      for (let a = 0; a < 3; a++) expect(c.P[a][q * c.N + c.nKb]).toBe(c.lik[a][2]); // the `no` column
    }
  });

  it("uses the near list of the FIRST game that names the thing", () => {
    const first = compileKB(kb, [named([["cat", 1]]), game({ name: "zorp" }, [], { near: [["dog", 1]] })]);
    const only = compileKB(kb, [named([["cat", 1]])]);
    const q = qx("has_fur");
    for (let a = 0; a < 3; a++) expect(first.P[a][q * first.N + first.nKb]).toBe(only.P[a][q * only.N + only.nKb]);
  });

  it("counts apply on top of the borrowed base", () => {
    const log = [named([["cat", 1]], { turns: [{ id: "can_fly", a: "yes" }] })];
    const c = compileKB(kb, log);
    const q = qx("can_fly");
    const K = kb.engine.learnPriorStrength ?? 2;
    const b = c.lik[0][c.values[ix("cat") * c.Q + q]];
    expect(c.P[0][q * c.N + c.nKb]).toBe((K * b + 1) / (K + 1));
  });

  it("nearOf: top 5 KB things from category and question answers only, rounded to 4 places", () => {
    const c = compileKB(kb);
    const entries = [
      { turn: 1, kind: "category" as const, id: "animal", answer: "yes" as const },
      { turn: 2, kind: "question" as const, id: "can_fly", answer: "yes" as const },
      { turn: 3, kind: "question" as const, id: "has_fur", answer: "skip" as const },
      { turn: 4, kind: "guess" as const, id: "eagle", answer: "wrong" as const },
    ];
    const near = nearOf(c, entries);
    expect(near).toHaveLength(5);
    for (const [id, w] of near) {
      expect(ix(id)).toBeGreaterThanOrEqual(0);
      expect(w).toBe(Math.round(w * 1e4) / 1e4);
    }
    expect(near.reduce((s, [, w]) => s + w, 0)).toBeCloseTo(1, 3);
    // a wrongly guessed look-alike still counts: dropping the guess entry changes nothing
    expect(nearOf(c, entries.slice(0, 3))).toEqual(near);
    // highest first
    for (let i = 1; i < near.length; i++) expect(near[i - 1][1]).toBeGreaterThanOrEqual(near[i][1]);
  });

  it("kbThingByName finds a KB thing by normalized name", () => {
    expect(kbThingByName(kb, "the CAT")).toBe(ix("cat"));
    expect(kbThingByName(kb, "zorp")).toBe(-1);
    expect(kbThingByName(kb, "  ")).toBe(-1);
  });
});

describe("proper names (SPECS 3)", () => {
  it("keeps a proper name exactly as written; everything else lowercases the first letter", () => {
    expect(thingPhrase({ name: "Easter Bunny", article: "the", proper: true })).toBe("the Easter Bunny");
    expect(thingPhrase({ name: "Santa Claus", article: "", proper: true })).toBe("Santa Claus");
    expect(thingPhrase({ name: "Santa Claus", article: "" })).toBe("santa Claus");
    expect(thingPhrase({ name: "Cat", article: "a", proper: false })).toBe("a cat");
  });
  it("the compiled KB carries the flag through to guess lines", () => {
    const fixture: KB = { ...kb, things: kb.things.map((t, i) => (i === 0 ? { ...t, name: "Easter Bunny", article: "the", proper: true } : t)) };
    const c = compileKB(fixture);
    expect(thingPhrase(c.things[0])).toBe("the Easter Bunny");
    expect(thingPhrase(c.things[1])).toBe(thingPhrase({ name: kb.things[1].name, article: kb.things[1].article }));
  });
});

