// npm run kb:vectors: regenerate kb/test-vectors.json from kb/kb.json (SPECS §5).
// The TypeScript engine is the reference; Android replays this file in JUnit.
import { writeFileSync } from "node:fs";
import { applyBacks, replay } from "../src/engine/engine";
import { compileKB } from "../src/engine/kb";
import { mulberry32 } from "../src/engine/rng";
import type { AnswerToken } from "../src/engine/types";
import { loadKB, VECTORS_PATH } from "./lib/kb-io";
import { play, type PlayOptions } from "./lib/player";

const kb = loadKB();
const ckb = compileKB(kb);

const idx = (id: string) => {
  const i = ckb.tIndex.get(id);
  if (i === undefined) throw new Error(`vector game needs thing "${id}", which is not in the KB`);
  return i;
};

interface Spec extends Omit<PlayOptions, "thing"> {
  name: string;
  thing: string;
  /** Searched-for noise seed so the game contains a wrong guess and still ends in a win. */
  findRecovery?: boolean;
  check?: (r: ReturnType<typeof play>) => void;
}

const must = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`vector coverage: ${msg}`);
};

const specs: Spec[] = [
  { name: "cat-truthful", thing: "cat", seed: 12345, maybe: "random" },
  { name: "apple-truthful", thing: "apple", seed: 2024, maybe: "random" },
  { name: "spoon-truthful", thing: "spoon", seed: 777, maybe: "random" },
  { name: "rain-truthful", thing: "rain", seed: 31337, maybe: "random" },
  { name: "elephant-maybe-as-maybe", thing: "elephant", seed: 99, maybe: "maybe" },
  { name: "goldfish-maybe-as-yes", thing: "goldfish", seed: 5150, maybe: "yes" },
  { name: "dog-wrong-guess-recovery", thing: "dog", seed: 8086, findRecovery: true },
  {
    name: "cat-overtime-stumped",
    thing: "cat",
    seed: 4242,
    wrongAlways: true,
    check: (r) => must(r.session.result?.outcome === "stumped" && r.session.result.turn === 25, "overtime game must end stumped at 25"),
  },
  { name: "bread-with-skips", thing: "bread", seed: 606, skipEvery: 3 },
  { name: "car-several-backs", thing: "car", seed: 1999, detourTurns: [3, 5, 9] },
  { name: "lion-back-across-guess", thing: "lion", seed: 2112, backAcrossGuess: true },
  { name: "potato-unknown-on-q2", thing: "potato", seed: 64, categoryScript: ["no", "skip"] },
  { name: "moon-right-then-back", thing: "moon", seed: 1337, rightThenBack: true },
  {
    name: "all-skip-uniform",
    thing: "rain",
    seed: 3,
    categoryScript: ["skip"],
    allQuestions: "skip",
    check: (r) => must(r.session.result?.outcome === "stumped", "all-skip game should stump"),
  },
  { name: "sun-noisy-10pct", thing: "sun", seed: 555, noise: 0.1 },
  // sun is "other" with altCategories mineral: SOMETIMES on "Is it a mineral?", then the phase ends
  { name: "sun-sometimes-on-mineral", thing: "sun", seed: 2468, maybe: "maybe" },
  // house is "other" with altCategories mineral and vegetable: SOMETIMES on Q2, then on Q3
  { name: "house-sometimes-on-q2-and-q3", thing: "house", seed: 1357, maybe: "maybe" },
  { name: "car-category-backs", thing: "car", seed: 9001, detourTurns: [1, 2, 3] },
  { name: "bicycle-skips-and-backs", thing: "bicycle", seed: 12, skipEvery: 4, detourTurns: [4, 6] },
];

function prngVectors() {
  return [42, -7].map((seed) => {
    const r = mulberry32(seed);
    return { seed, first: Array.from({ length: 10 }, () => r()) };
  });
}

function buildGame(name: string, seed: number, tokens: (AnswerToken | "back")[]) {
  const s = replay(ckb, seed, applyBacks(tokens));
  const expectTurns = s.entries.map((e) => ({ turn: e.turn, kind: e.kind, id: e.id }));
  if (s.current) {
    const c = s.current;
    const e =
      c.kind === "category"
        ? { turn: c.turn, kind: c.kind, id: kb.categories[c.cat] }
        : c.kind === "question"
          ? { turn: c.turn, kind: c.kind, id: kb.questions[c.q].id }
          : { turn: c.turn, kind: c.kind, id: kb.things[c.thing].id };
    expectTurns.push(e as never);
  }
  if (!s.result) throw new Error(`${name} did not finish`);
  return {
    name,
    seed,
    answers: tokens,
    expect: expectTurns,
    result: s.result,
    finalWeightsTop3: s.topN(3).map((i) => [kb.things[i].id, s.w[i]]),
  };
}

const games: ReturnType<typeof buildGame>[] = [];
for (const spec of specs) {
  const { name, thing, findRecovery, check, ...opts } = spec;
  let r: ReturnType<typeof play>;
  if (findRecovery) {
    let found = false;
    r = undefined as never;
    for (let noiseSeed = 1; noiseSeed <= 500 && !found; noiseSeed++) {
      const rnd = mulberry32(noiseSeed);
      const attempt = play(ckb, { ...opts, thing: idx(thing), seed: opts.seed, noise: 0.15, noiseRnd: rnd, rnd });
      if (attempt.wrongGuesses >= 1 && attempt.session.result?.outcome === "win") {
        r = attempt;
        found = true;
      }
    }
    must(found, `${name}: no recovery game found`);
  } else {
    const rnd = mulberry32(opts.seed ^ 0x9e3779b9);
    r = play(ckb, { ...opts, thing: idx(thing), rnd, noiseRnd: rnd });
  }
  check?.(r);
  games.push(buildGame(name, opts.seed, r.tokens));
}

// Coverage assertions from SPECS §5.
must(games.length >= 12, "at least 12 games");
// Category phase of each game: the answers given to the category questions, in order.
const catPhase = (g: (typeof games)[number]) =>
  g.expect.filter((e) => e.kind === "category").map((e, i) => ({ id: e.id, answer: g.answers.filter((a) => a !== "back")[i] }));
const phases = games.map((g) => ({ g, cats: catPhase(g) }));
must(games.some((g) => g.answers.filter((a) => a === "skip").length > 0 && g.answers[0] !== "skip" && g.name.includes("skips")), "a game with Skips");
must(games.some((g) => g.answers.filter((a) => a === "back").length >= 3), "a game with several Backs");
must(phases.some(({ cats }) => cats[0]?.answer === "yes"), "a category settled at Q1");
must(phases.some(({ cats }) => cats[1]?.answer === "yes"), "a category settled at Q2");
must(phases.some(({ cats }) => cats[2]?.answer === "yes"), "a category settled at Q3");
must(phases.some(({ cats }) => cats.length === 3 && cats.every((c) => c.answer === "no")), "three NOs");
must(phases.some(({ cats }) => cats.some((c) => c.answer === "maybe")), "a SOMETIMES on a category question");
must(phases.some(({ cats }) => cats.some((c) => c.answer === "skip")), "an UNKNOWN on a category question");
for (const [name, cat] of [["cat-truthful", "animal"], ["apple-truthful", "vegetable"], ["spoon-truthful", "mineral"], ["rain-truthful", "other"]] as const) {
  const g = games.find((x) => x.name === name);
  must(!!g && g.result.outcome === "win", `a truthful ${cat} win (${name})`);
}
must(games.some((g) => g.name === "dog-wrong-guess-recovery" && g.answers.includes("wrong") && g.result.outcome === "win"), "wrong guess then recovery");
must(
  games.some((g) => {
    // a Back that crosses a guess: a guess answer is applied, then a back pops back over it
    const t = g.answers;
    return t.some((a, i) => (a === "wrong" || a === "right") && t.slice(i + 1).includes("back"));
  }),
  "a Back across a guess",
);

const out = { kbVersion: kb.kbVersion, prng: prngVectors(), games };
writeFileSync(VECTORS_PATH, JSON.stringify(out, null, 1) + "\n");
console.log(`✓ wrote ${games.length} games for ${kb.kbVersion} to kb/test-vectors.json`);
for (const g of games) console.log(`  ${g.name.padEnd(28)} ${g.result.outcome} @ ${g.result.turn}  (${g.answers.length} tokens)`);
