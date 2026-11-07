import { create } from "zustand";
import { compileKB, replay, type AnswerToken, type GameView, type KB, type LogActual, type LogGame } from "@/engine";
import { appendGame, loadLog, removeGame, setActual } from "@/lib/gameLog";
import { play, type SfxName } from "@/audio/sfx";
import { CONFIRM_MESSAGE, IDLE_MESSAGE, messagesFor, type Message } from "@/lib/messages";
import { loadStats, saveStats, withGame, type Stats } from "@/lib/stats";
import kbJson from "../../kb/kb.json";

const kbData = kbJson as unknown as KB;
/**
 * The compiled KB for the game on screen: the KB plus what the game log has taught it (v9).
 * It is frozen per game: `start()` recompiles it, and nothing else does, so UNDO replays with the
 * same compile and a game never learns from itself. An ES live binding, so importers see updates.
 */
export let ckb = compileKB(kbData, loadLog());
export const kbBase = kbData;

export type Slot = 0 | 1 | 2 | 3;
/** Anything on the device that animates when pressed. */
export type Control = Slot | "undo" | "new" | "sound";
export type Mode = "idle" | "category" | "question" | "guess" | "ended";

/** Left to right on the device. */
const QUESTION_TOKENS: AnswerToken[] = ["skip", "no", "yes", "maybe"];

const THINK_MS = 400;
const HOLD_MS = 1500; // the "Hmm. Give me five more." line stays this long, then the guess replaces it
const FLASH_MS = 120;

interface Screen {
  /** Changes whenever the LCD should start typing afresh. */
  key: number;
  messages: Message[];
  msgIndex: number;
  typingDone: boolean;
}

interface GameState {
  started: boolean;
  seed: number;
  history: AnswerToken[];
  view: GameView | null;
  confirming: boolean;
  thinking: boolean;
  screen: Screen;
  /** Bumped to ask the LCD to finish typing at once. */
  skipTick: number;
  flash: Control | null;
  stats: Stats;
  /** `ts` of this game's entry in the game log once it has ended, else null. */
  loggedTs: number | null;
  /** True once the player has told me what they were thinking of (stumped games only). */
  taught: boolean;
  teach: (actual: LogActual) => void;
  press: (slot: Slot) => void;
  undo: () => void;
  flashControl: (c: Control) => void;
  newGame: () => void;
  cancel: () => void;
  lcdDone: () => void;
}

export function modeOf(s: Pick<GameState, "started" | "view">): Mode {
  if (!s.started || !s.view) return "idle";
  const cur = s.view.current;
  if (!cur) return "ended";
  return cur.kind;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function newSeed(): number {
  const a = new Uint32Array(1);
  if (typeof crypto !== "undefined") crypto.getRandomValues(a);
  else a[0] = Math.floor(Math.random() * 2 ** 32);
  return a[0] | 0;
}

let thinkTimer: ReturnType<typeof setTimeout> | undefined;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let flashTimer: ReturnType<typeof setTimeout> | undefined;
let screenKey = 0;

function clearTimers() {
  clearTimeout(thinkTimer);
  clearTimeout(holdTimer);
  thinkTimer = holdTimer = undefined;
}

/** The log entry for a game that has just ended (SPECS 11.1). */
function logGameFor(view: GameView, ts: number): LogGame {
  const result = view.result!;
  const turns = view.entries.map((e) => ({
    id: e.kind === "category" ? "cat:" + e.id : e.kind === "guess" ? "guess:" + e.id : e.id!,
    a: e.answer as string,
  }));
  let actual: LogActual = null;
  if (result.outcome === "win") {
    // Wins record the guessed thing. A learned thing goes in by name, which is how the log refers to it.
    const last = view.entries[view.entries.length - 1];
    const t = ckb.things[ckb.tIndex.get(last.id!)!];
    actual = t.learned ? { name: t.name } : { id: t.id };
  }
  return { ts, kbVersion: kbData.kbVersion, outcome: result.outcome, turn: result.turn, turns, actual };
}

export const useGame = create<GameState>((set, get) => {
  /** Put messages on the LCD; the first one's sound plays now. */
  function show(messages: Message[]) {
    clearTimeout(holdTimer);
    set({ thinking: false, screen: { key: ++screenKey, messages, msgIndex: 0, typingDone: false } });
    if (messages[0].sfx) play(messages[0].sfx);
  }

  function showDefault() {
    const { started, view, confirming } = get();
    if (confirming) return show([CONFIRM_MESSAGE]);
    if (!started || !view) return show([IDLE_MESSAGE]);
    show(messagesFor(ckb, view));
  }

  /** Move to a new history: replay, keep the stats honest, then show the result. */
  function go(history: AnswerToken[], opts: { think: boolean }) {
    const prev = get().view;
    const view = replay(ckb, get().seed, history).view();
    let stats = get().stats;
    if (prev?.result && !view.result) stats = withGame(stats, prev.result, -1);
    if (view.result && !prev?.result) stats = withGame(stats, view.result, 1);
    if (stats !== get().stats) saveStats(stats);
    // The game log follows the stats: a finished game is appended, and UNDO from the end takes it back out.
    let loggedTs = get().loggedTs;
    let taught = get().taught;
    if (prev?.result && !view.result) {
      if (loggedTs !== null) removeGame(loggedTs);
      loggedTs = null;
      taught = false;
    }
    if (view.result && !prev?.result) {
      loggedTs = appendGame(logGameFor(view, Date.now())).ts;
      taught = false;
    }
    clearTimers();
    set({ history, view, stats, confirming: false, loggedTs, taught });
    const msgs = messagesFor(ckb, view);
    if (opts.think && view.current && !reducedMotion()) {
      set({ thinking: true });
      thinkTimer = setTimeout(() => show(msgs), THINK_MS);
    } else {
      show(msgs);
    }
  }

  function start() {
    clearTimers();
    ckb = compileKB(kbData, loadLog()); // the one place the log is read into the engine
    set({ started: true, seed: newSeed(), history: [], view: null, confirming: false, loggedTs: null, taught: false });
    go([], { think: false });
  }

  function flashSlot(slot: Control) {
    clearTimeout(flashTimer);
    set({ flash: slot });
    flashTimer = setTimeout(() => set({ flash: null }), FLASH_MS);
  }

  return {
    started: false,
    seed: 0,
    history: [],
    view: null,
    confirming: false,
    thinking: false,
    screen: { key: 0, messages: [IDLE_MESSAGE], msgIndex: 0, typingDone: false },
    skipTick: 0,
    flash: null,
    stats: loadStats(),
    loggedTs: null,
    taught: false,

    teach: (actual) => {
      const { loggedTs, view } = get();
      if (loggedTs === null || !view?.result || view.result.outcome !== "stumped") return;
      // If the log was cleared since the game ended there is nothing to attach it to: close the box.
      if (setActual(loggedTs, actual)) set({ taught: true });
      else set({ loggedTs: null });
    },

    press: (slot) => {
      const s = get();
      // Every press animates and clicks. Whether it also does anything depends on the state.
      flashSlot(slot);
      if (s.thinking) {
        play("press");
        return;
      }
      const { screen } = s;
      // A press while the text is still typing only finishes the text.
      if (!screen.typingDone) {
        play("press");
        set({ skipTick: s.skipTick + 1 });
        return;
      }
      // Or moves past a lead-in message like "Hmm. Give me five more."
      if (screen.msgIndex < screen.messages.length - 1) {
        play("press");
        clearTimeout(holdTimer);
        const next = screen.msgIndex + 1;
        set({ screen: { ...screen, msgIndex: next, typingDone: false } });
        const sfx = screen.messages[next].sfx;
        if (sfx) play(sfx);
        return;
      }
      const mode = modeOf(s);
      if (s.confirming) {
        play("press");
        if (slot === 2) start();
        else if (slot === 1) {
          set({ confirming: false });
          showDefault();
        }
        return;
      }
      if (mode === "idle" || mode === "ended") {
        play("press");
        if (slot === 2) start();
        return;
      }
      let token: AnswerToken | null = null;
      let sound: SfxName = "press";
      // v7: category questions answer exactly like ordinary questions
      if (mode === "question" || mode === "category") token = QUESTION_TOKENS[slot];
      else if (slot === 2) token = "right";
      else if (slot === 1) {
        token = "wrong";
        sound = "wrong";
      }
      play(sound);
      if (token) go([...s.history, token], { think: true });
    },

    undo: () => {
      const s = get();
      flashSlot("undo");
      play("press");
      if (s.thinking) return;
      if (!s.started || !s.view || s.confirming) return;
      if (s.history.length === 0) return;
      go(s.history.slice(0, -1), { think: false });
    },

    flashControl: (c) => flashSlot(c),

    newGame: () => {
      const s = get();
      flashSlot("new");
      play("press");
      if (s.confirming) return;
      const mode = modeOf(s);
      if (mode === "idle" || mode === "ended") {
        start();
        return;
      }
      clearTimers();
      set({ confirming: true, thinking: false });
      show([CONFIRM_MESSAGE]);
    },

    cancel: () => {
      if (!get().confirming) return;
      set({ confirming: false });
      showDefault();
    },

    lcdDone: () => {
      const { screen } = get();
      if (screen.typingDone) return;
      set({ screen: { ...screen, typingDone: true } });
      // Lead-in messages move on by themselves after a beat.
      if (screen.msgIndex < screen.messages.length - 1) {
        const key = screen.key;
        holdTimer = setTimeout(() => {
          const cur = get().screen;
          if (cur.key !== key || cur.msgIndex !== screen.msgIndex) return;
          const next = cur.msgIndex + 1;
          set({ screen: { ...cur, msgIndex: next, typingDone: false } });
          const sfx = cur.messages[next].sfx;
          if (sfx) play(sfx);
        }, HOLD_MS);
      }
    },
  };
});
