export type Value = "yes" | "maybe" | "no" | "unknown";
export type Category = "animal" | "vegetable" | "mineral" | "other";

export interface EngineConstants {
  likelihood: Record<"yes" | "maybe" | "no", Record<Value, number>>;
  category: { match: number; alt: number; other: number };
  guessConfidence: number;
  guessMinTurn: number;
  forceGuessTurn: number;
  maxTurns: number;
  topK: number;
}

export interface Question {
  id: string;
  text: string;
  group: string;
}

export interface Thing {
  id: string;
  name: string;
  article: "a" | "an" | "the" | "";
  category: Category;
  altCategories?: Category[];
  yes: string[];
  maybe?: string[];
  unknown?: string[];
}

export interface KB {
  schemaVersion: number;
  kbVersion: string;
  categories: Category[];
  engine: EngineConstants;
  questions: Question[];
  things: Thing[];
}

/** Answer tokens (SPECS §5). `back` is handled by the caller, not the engine. */
export type CategoryAnswer = Category | "skip";
export type QuestionAnswer = "yes" | "no" | "maybe" | "skip";
export type GuessAnswer = "right" | "wrong";
export type AnswerToken = CategoryAnswer | QuestionAnswer | GuessAnswer;

export type TurnKind = "category" | "question" | "guess";

/** What the player is looking at right now. */
export type CurrentTurn =
  | { turn: number; kind: "category" }
  | { turn: number; kind: "question"; q: number }
  | { turn: number; kind: "guess"; thing: number };

/** One played turn, for the recap and the vectors. */
export interface RecapEntry {
  turn: number;
  kind: TurnKind;
  /** question id for questions, thing id for guesses, absent for the category turn */
  id?: string;
  answer: AnswerToken;
}

export type Outcome = { outcome: "win" | "stumped"; turn: number };

export interface GameView {
  /** The turn awaiting an answer, or null once the game has ended. */
  current: CurrentTurn | null;
  /** Set once the game has ended. */
  result: Outcome | null;
  /** Every turn answered so far, in order. */
  entries: RecapEntry[];
  /** Normalized weights, indexed like kb.things. */
  weights: Float64Array;
  /** Thing indices guessed wrong. */
  guessed: ReadonlySet<number>;
  /** Top 3 by weight among things not guessed (valid at any time, shown when stumped). */
  runnerUps: number[];
}
