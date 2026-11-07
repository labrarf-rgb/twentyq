// npm run kb:vectors: regenerate kb/test-vectors.json from kb/kb.json (SPECS §5).
// The TypeScript engine is the reference; Android replays this file in JUnit.
import { writeFileSync } from "node:fs";
import { applyBacks, replay } from "../src/engine/engine";
import { compileKB } from "../src/engine/kb";
import { mulberry32 } from "../src/engine/rng";
import type { AnswerToken, LogActual, LogGame } from "../src/engine/types";
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

function buildGame(name: string, seed: number, tokens: (AnswerToken | "back")[], c: ReturnType<typeof compileKB> = ckb, learned?: LogGame[]) {
  const s = replay(c, seed, applyBacks(tokens));
  const expectTurns = s.entries.map((e) => ({ turn: e.turn, kind: e.kind, id: e.id }));
  if (s.current) {
    const cur = s.current;
    const e =
      cur.kind === "category"
        ? { turn: cur.turn, kind: cur.kind, id: kb.categories[cur.cat] }
        : cur.kind === "question"
          ? { turn: cur.turn, kind: cur.kind, id: kb.questions[cur.q].id }
          : { turn: cur.turn, kind: cur.kind, id: c.things[cur.thing].id };
    expectTurns.push(e as never);
  }
  if (!s.result) throw new Error(`${name} did not finish`);
  return {
    name,
    seed,
    // v9 (SPECS 11.6): the game log applied before the game is played. Absent means an empty log.
    ...(learned ? { learned } : {}),
    answers: tokens,
    ...(learned ? { thingCount: c.N, learnedThings: c.things.slice(c.nKb).map((t) => ({ id: t.id, name: t.name })) } : {}),
    expect: expectTurns,
    result: s.result,
    finalWeightsTop3: s.topN(3).map((i) => [c.things[i].id, s.w[i]]),
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

// ---- v9 (SPECS 11.6): games played on a device that has learned from a game log.
// Each log is built by simulating real games on the plain KB, so the counts are realistic.
// Names are fake on purpose ("zorp", "blip frobnitz"): they can never become KB things.
const tidx = (id: string) => idx(id);
let tsClock = 1762480000000;

/** A log entry from a simulated game on the plain KB: a player who answers like `like`, then `actual`. */
function logGame(like: string, seed: number, actual: LogActual, opts: Partial<PlayOptions> = {}): LogGame {
  const rnd = mulberry32(seed ^ 0x51ed270b);
  const r = play(ckb, { thing: -1, answerAs: tidx(like), seed, maybe: "random", rnd, noiseRnd: rnd, wrongAlways: true, ...opts });
  const turns = r.session.entries.map((e) => ({
    id: e.kind === "category" ? "cat:" + e.id : e.kind === "guess" ? "guess:" + e.id : e.id!,
    a: e.answer as string,
  }));
  const res = r.session.result!;
  tsClock += 61000;
  return { ts: tsClock, kbVersion: kb.kbVersion, outcome: res.outcome, turn: res.turn, turns, actual };
}

function learnedGame(name: string, like: string, seed: number, log: LogGame[], target: string | null, maybe: PlayOptions["maybe"] = "random") {
  const c = compileKB(kb, log);
  const rnd = mulberry32(seed ^ 0x2545f491);
  const ti = target === null ? -1 : c.tIndex.get(target);
  must(ti !== undefined, `${name}: learned thing "${target}" does not exist`);
  const r = play(c, { thing: ti!, answerAs: tidx(like), seed, maybe, rnd, noiseRnd: rnd });
  return { c, r, game: buildGame(name, seed, r.tokens, c, log) };
}

// 1. A taught fake thing is guessed by name. The player answers like rain; the KB has no zorp.
const zorpLog = [logGame("rain", 101, { name: "Zorp" }), logGame("rain", 102, { name: "a zorp" })];
const zorpWin = learnedGame("learned-guesses-a-learned-thing", "rain", 103, zorpLog, "learned:zorp");
must(zorpWin.r.session.result?.outcome === "win" && zorpWin.game.expect.some((e) => e.kind === "guess" && e.id === "learned:zorp"), "a game that guesses a learned thing by name");
games.push(zorpWin.game);

// 2. Learned counts change a question choice: dog games taught as answers a horse would give.
const dogLog = [1, 2, 3, 4].map((n) => logGame("horse", 200 + n, { id: "dog" }));
{
  const plain = play(ckb, { thing: tidx("dog"), seed: 4711, maybe: "maybe" });
  const c = compileKB(kb, dogLog);
  const learned = play(c, { thing: tidx("dog"), seed: 4711, maybe: "maybe" });
  const qs = (r: typeof plain) => r.session.entries.filter((e) => e.kind === "question").map((e) => e.id).join(",");
  must(qs(plain) !== qs(learned), "learned counts must change the questions asked (learned-changes-the-questions)");
  games.push(buildGame("learned-changes-the-questions", 4711, learned.tokens, c, dogLog));
}

// 3. The same new thing named with different spelling and case, plus a second new thing.
const spellLog = [
  logGame("spoon", 301, { name: "  Blip   Frobnitz " }),
  logGame("spoon", 302, { name: "the BLIP frobnitz" }),
  logGame("rain", 303, { name: "Zorp" }),
  logGame("spoon", 304, { name: "a blip frobnitz" }),
  logGame("rain", 305, { name: "an ZORP" }),
];
const spell = learnedGame("learned-same-name-different-spelling", "spoon", 306, spellLog, "learned:blip frobnitz");
must(spell.c.things.slice(spell.c.nKb).map((t) => t.id).join("|") === "learned:blip frobnitz|learned:zorp", "two learned things, in order of first mention");
must(spell.c.things[spell.c.nKb].name === "Blip   Frobnitz" || spell.c.things[spell.c.nKb].name === "Blip   Frobnitz".trim(), "display name is the first game's trimmed text");
games.push(spell.game);

// 4. Unusable log games are ignored: an id that is not in the KB, a null actual, an empty name,
// skips, guess turns and turn ids the KB does not have. The result must equal a game on an empty log.
const noiseLog: LogGame[] = [
  logGame("cat", 401, { id: "thing_that_is_not_in_the_kb" }),
  logGame("cat", 402, null),
  logGame("cat", 403, { name: "   " }),
  { ...logGame("cat", 404, { id: "cat" }, { skipEvery: 1, categoryScript: ["skip"] }) }, // every answer skipped: nothing to count
  { ...logGame("cat", 405, null), turns: [{ id: "question_removed_from_the_kb", a: "yes" }, { id: "guess:cat", a: "wrong" }, { id: "cat:animal", a: "yes" }] },
];
{
  const withLog = learnedGame("learned-ignores-unusable-games", "cat", 406, noiseLog, null);
  const empty = play(ckb, { thing: -1, answerAs: tidx("cat"), seed: 406, maybe: "random", rnd: mulberry32(406 ^ 0x2545f491), noiseRnd: mulberry32(406 ^ 0x2545f491) });
  must(withLog.c.N === ckb.N, "unusable log games must add no learned things");
  must(JSON.stringify(replay(ckb, 406, empty.history).w) === JSON.stringify(withLog.r.session.w), "an unusable log must change nothing");
  games.push(withLog.game);
}

// 5. A name that matches a KB thing's name (ignoring a leading article) teaches that KB thing.
const catLog = [logGame("dog", 501, { name: "The Cat" }), logGame("dog", 502, { id: "cat" })];
{
  const g5 = learnedGame("learned-name-matches-a-kb-thing", "dog", 503, catLog, "cat");
  must(g5.c.N === ckb.N, "a name that matches a KB thing adds no learned thing");
  games.push(g5.game);
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

const out = {
  kbVersion: kb.kbVersion,
  format: "See docs/VECTORS.md in the web repo: the optional per-game `learned` field is a game log (SPECS 11.1) applied before the game is played.",
  prng: prngVectors(),
  games,
};
writeFileSync(VECTORS_PATH, JSON.stringify(out, null, 1) + "\n");
console.log(`✓ wrote ${games.length} games for ${kb.kbVersion} to kb/test-vectors.json`);
for (const g of games) console.log(`  ${g.name.padEnd(38)} ${g.result.outcome} @ ${g.result.turn}  (${g.answers.length} tokens)`);
