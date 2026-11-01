import type { Outcome } from "@/engine";
import { readStore, writeStore } from "./storage";

export interface Stats {
  played: number;
  appWins: number;
  stumped: number;
  totalTurnsOnWins: number;
}

const KEY = "twentyq.stats";
export const EMPTY_STATS: Stats = { played: 0, appWins: 0, stumped: 0, totalTurnsOnWins: 0 };

export function loadStats(): Stats {
  try {
    const raw = readStore(KEY);
    if (!raw) return { ...EMPTY_STATS };
    const p = JSON.parse(raw);
    const n = (x: unknown) => (typeof x === "number" && x >= 0 ? Math.floor(x) : 0);
    return { played: n(p.played), appWins: n(p.appWins), stumped: n(p.stumped), totalTurnsOnWins: n(p.totalTurnsOnWins) };
  } catch {
    return { ...EMPTY_STATS };
  }
}

export function saveStats(s: Stats): void {
  writeStore(KEY, JSON.stringify(s));
}

/** Add (sign = 1) or take back (sign = -1) one finished game. Undo from the end screen takes it back. */
export function withGame(s: Stats, r: Outcome, sign: 1 | -1): Stats {
  const win = r.outcome === "win";
  return {
    played: Math.max(0, s.played + sign),
    appWins: Math.max(0, s.appWins + (win ? sign : 0)),
    stumped: Math.max(0, s.stumped + (win ? 0 : sign)),
    totalTurnsOnWins: Math.max(0, s.totalTurnsOnWins + (win ? sign * r.turn : 0)),
  };
}

export function statsLine(s: Stats): string {
  if (s.played === 0) return "No games yet";
  const times = s.stumped === 1 ? "1 time" : `${s.stumped} times`;
  return `Played ${s.played} · You stumped me ${times}`;
}
