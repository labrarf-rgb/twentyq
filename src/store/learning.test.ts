import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLog, LOG_CAP, loadLog, saveLog } from "@/lib/gameLog";
import { ckb, useGame } from "./game";
import type { LogGame } from "@/engine";

const g = () => useGame.getState();
function settle() {
  vi.advanceTimersByTime(500);
  g().lcdDone();
}

/** Play every turn with UNKNOWN, answering Wrong to every guess: always ends stumped. */
function playToStump() {
  g().lcdDone();
  g().press(2);
  settle();
  for (let i = 0; i < 60 && g().view?.current; i++) {
    const cur = g().view!.current!;
    g().press(cur.kind === "guess" ? 1 : 0);
    settle();
  }
  expect(g().view?.result?.outcome).toBe("stumped");
}

beforeEach(() => {
  vi.useFakeTimers();
  clearLog();
  useGame.setState({ started: false, history: [], view: null, confirming: false, thinking: false, loggedTs: null, taught: false, stats: { played: 0, appWins: 0, stumped: 0, totalTurnsOnWins: 0 } });
  g().lcdDone();
});
afterEach(() => {
  vi.useRealTimers();
  clearLog();
});

describe("game log (SPECS 11.1)", () => {
  it("appends a finished game with its turns, and a stumped game starts with no actual", () => {
    playToStump();
    const log = loadLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ outcome: "stumped", actual: null });
    expect(log[0].turns[0]).toEqual({ id: "cat:animal", a: "skip" });
    expect(log[0].turns.some((t) => t.id.startsWith("guess:") && t.a === "wrong")).toBe(true);
    expect(log[0].turns).toHaveLength(25);
    expect(log[0].turn).toBe(25);
  });

  it("UNDO from the end screen removes the entry", () => {
    playToStump();
    expect(loadLog()).toHaveLength(1);
    settle();
    g().undo();
    expect(loadLog()).toHaveLength(0);
    expect(g().loggedTs).toBeNull();
  });

  it("a win records the guessed thing as actual", () => {
    g().lcdDone();
    g().press(2);
    settle();
    g().press(0);
    for (let i = 0; i < 60 && g().view?.current && g().view!.current!.kind !== "guess"; i++) {
      settle();
      g().press(0);
    }
    settle();
    const guessed = ckb.things[(g().view!.current as { thing: number }).thing];
    g().press(2); // right
    expect(g().view?.result?.outcome).toBe("win");
    expect(loadLog()[0]).toMatchObject({ outcome: "win", actual: { id: guessed.id } });
  });

  it("teaching a stumped game fills in its actual, once", () => {
    playToStump();
    g().teach({ name: "a zorp" });
    expect(g().taught).toBe(true);
    expect(loadLog()[0].actual).toEqual({ name: "a zorp" });
  });

  it("the next game learns it: the compiled KB gains the thing, and only at the next start", () => {
    playToStump();
    g().teach({ name: "a zorp" });
    expect(ckb.things.some((t) => t.id === "learned:zorp")).toBe(false); // frozen for this game (undo replays the same compile)
    settle();
    g().press(2); // YES starts a new game
    expect(ckb.things.some((t) => t.id === "learned:zorp")).toBe(true);
    expect(ckb.things[ckb.tIndex.get("learned:zorp")!].name).toBe("a zorp");
  });

  it("keeps the most recent 1,000 games", () => {
    const mk = (n: number): LogGame => ({ ts: n, kbVersion: "t", outcome: "win", turn: 5, turns: [], actual: { id: "cat" } });
    saveLog(Array.from({ length: LOG_CAP + 5 }, (_, i) => mk(i + 1)));
    const log = loadLog();
    expect(log).toHaveLength(LOG_CAP);
    expect(log[0].ts).toBe(6);
  });
});
