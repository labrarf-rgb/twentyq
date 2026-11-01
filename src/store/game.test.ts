import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ckb, modeOf, useGame } from "./game";
import { listPhrases, messagesFor } from "@/lib/messages";
import { replay } from "@/engine";
import { statsLine, withGame } from "@/lib/stats";

const g = () => useGame.getState();

/** Finish typing and any thinking pause, as a patient player would. */
function settle() {
  vi.advanceTimersByTime(500);
  g().lcdDone();
}

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState({ started: false, history: [], view: null, confirming: false, thinking: false, stats: { played: 0, appWins: 0, stumped: 0, totalTurnsOnWins: 0 } });
  g().lcdDone();
});
afterEach(() => vi.useRealTimers());

describe("device flow", () => {
  it("idle: only YES starts a game; the other buttons press but do nothing", () => {
    expect(modeOf(g())).toBe("idle");
    g().lcdDone();
    for (const slot of [0, 1, 3] as const) {
      g().press(slot);
      expect(g().started).toBe(false);
      expect(g().flash).toBe(slot);
    }
    g().press(2);
    expect(modeOf(g())).toBe("category");
    expect(g().view?.current?.turn).toBe(1);
    expect(g().screen.messages[0].text).toBe("Is it an animal?");
  });

  it("a press while the text is typing only finishes the text", () => {
    g().lcdDone();
    g().press(2); // start; the category question is now typing
    const before = g().skipTick;
    g().press(2); // YES, but typing is not done
    expect(g().history).toEqual([]);
    expect(g().skipTick).toBe(before + 1);
  });

  it("maps the four buttons to the engine tokens", () => {
    g().lcdDone();
    g().press(2);
    settle();
    g().press(2); // YES on "Is it an animal?"
    expect(g().history).toEqual(["animal"]);
    settle();
    expect(modeOf(g())).toBe("question");
    const tokens = ["skip", "no", "yes", "maybe"];
    for (let slot = 0; slot < 4; slot++) {
      const hist = g().history.length;
      g().press(slot as 0 | 1 | 2 | 3);
      expect(g().history[hist]).toBe(tokens[slot]);
      settle();
    }
  });

  it("undo steps back one turn and replays the same game", () => {
    g().lcdDone();
    g().press(2);
    settle();
    g().press(2);
    settle();
    const q = g().view?.current;
    g().press(2);
    settle();
    g().undo();
    expect(g().history).toEqual(["animal"]);
    expect(g().view?.current).toEqual(q);
  });

  it("NEW GAME mid-game asks first; NO cancels and YES restarts", () => {
    g().lcdDone();
    g().press(2);
    settle();
    g().press(2);
    settle();
    g().newGame();
    expect(g().confirming).toBe(true);
    settle();
    g().press(0); // UNKNOWN does nothing while asking
    g().press(3);
    expect(g().confirming).toBe(true);
    g().press(1);
    expect(g().confirming).toBe(false);
    expect(g().history).toEqual(["animal"]);
    g().newGame();
    settle();
    g().press(2);
    expect(g().history).toEqual([]);
    expect(g().view?.current?.turn).toBe(1);
  });

  it("guess turns: UNKNOWN and SOMETIMES press but change nothing", () => {
    g().lcdDone();
    g().press(2);
    settle();
    // Force a late game: skip everything until turn 20 is a guess.
    g().press(0);
    for (let i = 0; i < 30 && g().view?.current?.kind !== "guess"; i++) {
      settle();
      g().press(0);
    }
    settle();
    expect(modeOf(g())).toBe("guess");
    const hist = g().history.length;
    g().press(0);
    g().press(3);
    expect(g().history.length).toBe(hist);
  });

  it("counts a finished game once, and takes it back on undo", () => {
    g().lcdDone();
    g().press(2);
    settle();
    g().press(0);
    for (let i = 0; i < 40 && g().view?.current; i++) {
      settle();
      const cur = g().view!.current!;
      if (cur.kind === "guess") g().press(1); // always Wrong
      else g().press(0);
    }
    expect(g().view?.result?.outcome).toBe("stumped");
    expect(g().stats).toMatchObject({ played: 1, stumped: 1, appWins: 0 });
    settle();
    g().undo();
    expect(g().stats.played).toBe(0);
    settle();
    g().press(2); // Right this time
    expect(g().view?.result?.outcome).toBe("win");
    expect(g().stats).toMatchObject({ played: 1, appWins: 1, stumped: 0 });
  });
});

describe("turn 1 asks one category at a time", () => {
  const start = () => {
    g().lcdDone();
    g().press(2);
    settle();
  };
  const text = () => g().screen.messages[g().screen.msgIndex].text;

  it("YES or SOMETIMES picks the category on screen", () => {
    start();
    g().press(2);
    expect(g().history).toEqual(["animal"]);
    settle();
    g().undo();
    settle();
    g().press(3);
    expect(g().history).toEqual(["animal"]);
  });

  it("NO moves on, and picks whichever category is showing", () => {
    start();
    const seen: string[] = [text()];
    for (const want of ["Is it a vegetable?", "Is it a mineral?", "Is it something else?"]) {
      g().press(1);
      settle();
      seen.push(text());
      expect(text()).toBe(want);
      expect(g().history).toEqual([]);
      expect(g().view?.current?.turn).toBe(1);
    }
    g().press(2);
    expect(g().history).toEqual(["other"]);
  });

  it("each category is reachable", () => {
    for (const [nos, want] of [[0, "animal"], [1, "vegetable"], [2, "mineral"], [3, "other"]] as const) {
      vi.runAllTimers();
      useGame.setState({ started: false, history: [], view: null, thinking: false, catStep: 0, confirming: false });
      start();
      for (let i = 0; i < nos; i++) {
        g().press(1);
        settle();
      }
      g().press(2);
      expect(g().history).toEqual([want]);
    }
  });

  it("NO on the last prompt, and UNKNOWN anywhere, send a category skip", () => {
    start();
    for (let i = 0; i < 4; i++) {
      g().press(1);
      settle();
    }
    expect(g().history).toEqual(["skip"]);
    settle();
    g().undo();
    settle();
    expect(g().history).toEqual([]);
    expect(text()).toBe("Is it an animal?");
    g().press(1);
    settle();
    g().press(0);
    expect(g().history).toEqual(["skip"]);
  });

  it("UNDO steps back one prompt, does nothing on the first, and from turn 2 returns to the first", () => {
    start();
    g().undo();
    settle();
    expect(text()).toBe("Is it an animal?");
    g().press(1);
    settle();
    g().press(1);
    settle();
    expect(text()).toBe("Is it a mineral?");
    g().undo();
    settle();
    expect(text()).toBe("Is it a vegetable?");
    g().press(1);
    settle();
    g().press(2); // mineral
    settle();
    expect(g().view?.current?.turn).toBe(2);
    g().undo();
    settle();
    expect(g().view?.current?.turn).toBe(1);
    expect(g().history).toEqual([]);
    expect(text()).toBe("Is it an animal?");
  });
});

describe("messages", () => {
  it("phrases a list of things", () => {
    const t = (id: string) => ckb.tIndex.get(id)!;
    expect(listPhrases(ckb, [t("cat"), t("moon"), t("bread")])).toBe("a cat, the moon, or bread");
    expect(listPhrases(ckb, [t("cat"), t("moon")])).toBe("a cat or the moon");
    expect(listPhrases(ckb, [t("cat")])).toBe("a cat");
  });

  it("never uses an em dash", () => {
    const s = replay(ckb, 7, ["animal"]);
    for (const m of messagesFor(ckb, s.view())) expect(m.text).not.toMatch(/—/);
  });

  it("keeps the overtime line as its own message and moves on to the guess by itself", () => {
    g().lcdDone();
    g().press(2);
    settle();
    g().press(0);
    for (let i = 0; i < 40 && g().view?.current?.turn !== 20; i++) {
      settle();
      g().press(0);
    }
    settle();
    expect(g().view?.current).toMatchObject({ turn: 20, kind: "guess" });
    g().press(1); // wrong at turn 20
    vi.advanceTimersByTime(500);
    expect(g().screen.messages.map((m) => m.text)).toEqual([
      "Hmm. Give me five more.",
      expect.stringMatching(/^I think it's .* Am I right\?$/),
    ]);
    expect(g().screen.msgIndex).toBe(0);
    g().lcdDone();
    vi.advanceTimersByTime(1400);
    expect(g().screen.msgIndex).toBe(0); // still showing the lead-in
    vi.advanceTimersByTime(200);
    expect(g().screen.msgIndex).toBe(1); // then the guess replaces it
  });

  it("says the overtime line only on turn 21", () => {
    const s = replay(ckb, 1, ["skip"]);
    while (s.current && s.current.turn < 20) s.apply("skip");
    expect(messagesFor(ckb, s.view())).toHaveLength(1);
    s.apply("wrong");
    const m = messagesFor(ckb, s.view());
    expect(m[0].text).toBe("Hmm. Give me five more.");
    expect(m).toHaveLength(2);
  });
});

describe("stats", () => {
  it("adds and removes games", () => {
    const e = { played: 0, appWins: 0, stumped: 0, totalTurnsOnWins: 0 };
    const w = withGame(e, { outcome: "win", turn: 9 }, 1);
    expect(w).toEqual({ played: 1, appWins: 1, stumped: 0, totalTurnsOnWins: 9 });
    expect(withGame(w, { outcome: "win", turn: 9 }, -1)).toEqual(e);
  });
  it("reads as a short line", () => {
    expect(statsLine({ played: 0, appWins: 0, stumped: 0, totalTurnsOnWins: 0 })).toBe("No games yet");
    expect(statsLine({ played: 12, appWins: 9, stumped: 3, totalTurnsOnWins: 90 })).toBe("Played 12 · You stumped me 3 times");
    expect(statsLine({ played: 2, appWins: 1, stumped: 1, totalTurnsOnWins: 9 })).toBe("Played 2 · You stumped me 1 time");
  });
});
