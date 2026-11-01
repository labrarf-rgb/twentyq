import { thingPhrase, type CompiledKB, type GameView } from "@/engine";
import type { SfxName } from "@/audio/sfx";

export interface Message {
  text: string;
  sfx?: SfxName;
}

export const IDLE_MESSAGE: Message = { text: "Think of something. Press YES to start." };
export const CONFIRM_MESSAGE: Message = { text: "Start over?" };
/** Turn 1 asks one category at a time, like the toy. */
export const CATEGORY_PROMPTS = ["Is it an animal?", "Is it a vegetable?", "Is it a mineral?", "Is it something else?"];
/** How the single category answer reads in the recap. */
export const CATEGORY_TEXT = "Is it an animal, vegetable, mineral, or other?";

/** "a cat, a dog, or the moon" */
export function listPhrases(ckb: CompiledKB, idx: number[]): string {
  const p = idx.map((i) => thingPhrase(ckb.kb.things[i]));
  if (p.length <= 1) return p.join("");
  if (p.length === 2) return `${p[0]} or ${p[1]}`;
  return `${p.slice(0, -1).join(", ")}, or ${p[p.length - 1]}`;
}

/** What the LCD says for the state in `view`. Several messages play one after another. */
export function messagesFor(ckb: CompiledKB, view: GameView, catStep = 0): Message[] {
  const cur = view.current;
  if (!cur) {
    const r = view.result!;
    if (r.outcome === "win") {
      return [{ text: `I win! Got it in ${r.turn}. Press YES to play again.`, sfx: "win" }];
    }
    const left = view.runnerUps.filter((i) => view.weights[i] > 0);
    const guesses = left.length ? ` Were you thinking of ${listPhrases(ckb, left)}?` : "";
    return [{ text: `You win! You stumped me.${guesses} Press YES to play again.`, sfx: "stumped" }];
  }
  if (cur.kind === "category") return [{ text: CATEGORY_PROMPTS[catStep], sfx: "question" }];
  if (cur.kind === "question") return [{ text: ckb.kb.questions[cur.q].text, sfx: "question" }];
  const guess: Message = {
    text: `I think it's ${thingPhrase(ckb.kb.things[cur.thing])}. Am I right?`,
    sfx: "guess",
  };
  // Turn 21 only follows a wrong turn-20 guess: say so once.
  if (cur.turn === ckb.c.forceGuessTurn + 1) return [{ text: "Hmm. Give me five more." }, guess];
  return [guess];
}

export const ANSWER_WORD: Record<string, string> = {
  yes: "Yes",
  no: "No",
  maybe: "Sometimes",
  skip: "Unknown",
  right: "Right",
  wrong: "Wrong",
  animal: "Animal",
  vegetable: "Vegetable",
  mineral: "Mineral",
  other: "Other",
};

/** Recap rows for the page below the device. */
export function recapRows(ckb: CompiledKB, view: GameView) {
  return view.entries.map((e) => {
    let text = CATEGORY_TEXT;
    if (e.kind === "question") text = ckb.kb.questions[ckb.qIndex.get(e.id!)!].text;
    if (e.kind === "guess") text = `I think it's ${thingPhrase(ckb.kb.things[ckb.tIndex.get(e.id!)!])}.`;
    return { turn: e.turn, text, answer: ANSWER_WORD[e.answer] ?? e.answer };
  });
}
