// A simulated player used by kb:vectors and kb:bench (SPECS §6).
import { replay } from "../../src/engine/engine";
import { V_MAYBE, V_NO, V_UNKNOWN, V_YES, type CompiledKB } from "../../src/engine/kb";
import type { AnswerToken, QuestionAnswer, Session } from "../../src/engine/index";

export type MaybePolicy = "random" | "maybe" | "yes";

/** The answer for a value code: yes -> Yes, no -> No, unknown -> Skip, maybe -> a pick of the three. */
function answerForValue(v: number, rnd: () => number, maybe: MaybePolicy): QuestionAnswer {
  if (v === V_YES) return "yes";
  if (v === V_NO) return "no";
  if (v === V_UNKNOWN) return "skip";
  if (v === V_MAYBE) {
    if (maybe === "maybe") return "maybe";
    if (maybe === "yes") return "yes";
    return (["yes", "no", "maybe"] as const)[Math.floor(rnd() * 3)];
  }
  throw new Error("unreachable");
}

/** How a player who is thinking of thing `ti` answers question `q`. */
export function truthfulAnswer(ckb: CompiledKB, ti: number, q: number, rnd: () => number, maybe: MaybePolicy = "random"): QuestionAnswer {
  return answerForValue(ckb.values[ti * ckb.Q + q], rnd, maybe);
}

/** v7: how that player answers category question `c` (0 animal, 1 vegetable, 2 mineral), from cv. */
export function categoryAnswer(ckb: CompiledKB, ti: number, c: number, rnd: () => number, maybe: MaybePolicy = "random"): QuestionAnswer {
  return answerForValue(ckb.cats[ti * 3 + c], rnd, maybe);
}

/** Replace a Yes/No/Maybe with a different random one of the three. */
export function flip(a: QuestionAnswer, rnd: () => number): QuestionAnswer {
  if (a === "skip") return a;
  const others = (["yes", "no", "maybe"] as const).filter((x) => x !== a);
  return others[Math.floor(rnd() * 2)];
}

export interface PlayResult {
  session: Session;
  /** Answers applied (no `back`). */
  history: AnswerToken[];
  /** Every token including `back`. */
  tokens: (AnswerToken | "back")[];
  wrongGuesses: number;
}

export interface PlayOptions {
  /** Index of the thing in mind: Right is answered when the engine guesses it. */
  thing: number;
  /** Answer questions the way this thing would (default: `thing`). For a player thinking of something the KB does not have. */
  answerAs?: number;
  seed: number;
  maybe?: MaybePolicy;
  rnd?: () => number;
  /** Chance of flipping each Yes/No/Maybe answer. */
  noise?: number;
  noiseRnd?: () => number;
  /** Answers for the category questions in order (Q1, Q2, Q3), instead of answering from cv. */
  categoryScript?: QuestionAnswer[];
  /** Answer Skip to every nth question (1-based among question turns). */
  skipEvery?: number;
  /** Override: answer this to every ordinary question turn. */
  allQuestions?: QuestionAnswer;
  /** Answer Wrong to every guess, even the true one. */
  wrongAlways?: boolean;
  /** At these question or category turns, answer wrongly, play one more turn, then Back twice. */
  detourTurns?: number[];
  /** On the first guess turn, answer Wrong, play one more turn, then Back twice. */
  backAcrossGuess?: boolean;
  /** On the first correct guess, answer Right, then Back and answer Wrong instead. */
  rightThenBack?: boolean;
}

export function play(ckb: CompiledKB, o: PlayOptions): PlayResult {
  const rnd = o.rnd ?? (() => 0.5);
  const history: AnswerToken[] = [];
  const tokens: (AnswerToken | "back")[] = [];
  let s = replay(ckb, o.seed, history);
  const push = (t: AnswerToken | "back") => {
    tokens.push(t);
    if (t === "back") history.pop();
    else history.push(t);
    s = replay(ckb, o.seed, history);
  };
  let questionsSeen = 0;
  const detoured = new Set<number>();
  let guessBackDone = false;
  let rightBackDone = false;
  let wrongGuesses = 0;

  const truthfulFor = (cur: NonNullable<Session["current"]>): AnswerToken => {
    if (cur.kind === "question") return truthfulAnswer(ckb, o.answerAs ?? o.thing, cur.q, rnd, o.maybe);
    if (cur.kind === "guess") return "wrong";
    return categoryAnswer(ckb, o.answerAs ?? o.thing, cur.cat, rnd, o.maybe);
  };

  while (s.current) {
    const cur = s.current;
    if (tokens.length > 500) throw new Error("runaway game");
    if (cur.kind === "category") {
      if (o.detourTurns?.includes(cur.turn) && !detoured.has(cur.turn)) {
        detoured.add(cur.turn);
        const truth = categoryAnswer(ckb, o.answerAs ?? o.thing, cur.cat, rnd, o.maybe);
        push(truth === "yes" ? "no" : "yes"); // deliberately the other way
        if (s.current) push(truthfulFor(s.current));
        push("back");
        push("back");
        continue;
      }
      let a: QuestionAnswer = o.categoryScript?.[cur.cat] ?? categoryAnswer(ckb, o.answerAs ?? o.thing, cur.cat, rnd, o.maybe);
      if (o.noise && !o.categoryScript && (o.noiseRnd ?? rnd)() < o.noise) a = flip(a, o.noiseRnd ?? rnd);
      push(a);
      continue;
    }
    if (cur.kind === "question") {
      if (o.detourTurns?.includes(cur.turn) && !detoured.has(cur.turn)) {
        detoured.add(cur.turn);
        const truth = truthfulAnswer(ckb, o.answerAs ?? o.thing, cur.q, rnd, o.maybe);
        push(truth === "yes" ? "no" : "yes"); // deliberately the other way
        if (s.current) push(truthfulFor(s.current));
        push("back");
        push("back");
        continue;
      }
      questionsSeen++;
      let a: QuestionAnswer = o.allQuestions ?? truthfulAnswer(ckb, o.answerAs ?? o.thing, cur.q, rnd, o.maybe);
      if (o.skipEvery && questionsSeen % o.skipEvery === 0) a = "skip";
      else if (o.noise && !o.allQuestions && (o.noiseRnd ?? rnd)() < o.noise) a = flip(a, o.noiseRnd ?? rnd);
      push(a);
      continue;
    }
    // guess
    if (o.backAcrossGuess && !guessBackDone) {
      guessBackDone = true;
      push("wrong");
      if (s.current) push(truthfulFor(s.current));
      push("back");
      push("back");
      continue;
    }
    const isTrue = cur.thing === o.thing && !o.wrongAlways;
    if (isTrue && o.rightThenBack && !rightBackDone) {
      rightBackDone = true;
      push("right");
      push("back");
      push("wrong");
      wrongGuesses++;
      continue;
    }
    if (isTrue) push("right");
    else {
      push("wrong");
      wrongGuesses++;
    }
  }
  return { session: s, history, tokens, wrongGuesses };
}
