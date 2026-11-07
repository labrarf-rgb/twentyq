// v9 (SPECS 11.1): the local game log. Stored under one localStorage key, newest last.
import type { LogActual, LogGame } from "@/engine";
import { readStore, writeStore } from "./storage";

export const LOG_KEY = "twentyq.log.v1";
/** The log keeps the most recent games only. */
export const LOG_CAP = 1000;

function isGame(g: unknown): g is LogGame {
  if (!g || typeof g !== "object") return false;
  const x = g as Record<string, unknown>;
  return Array.isArray(x.turns) && (x.outcome === "win" || x.outcome === "stumped") && typeof x.turn === "number";
}

export function loadLog(): LogGame[] {
  try {
    const raw = readStore(LOG_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!p || p.v !== 1 || !Array.isArray(p.games)) return [];
    return p.games.filter(isGame).slice(-LOG_CAP);
  } catch {
    return [];
  }
}

export function saveLog(games: LogGame[]): void {
  writeStore(LOG_KEY, JSON.stringify({ v: 1, games: games.slice(-LOG_CAP) }));
}

/** Append one finished game. Its `ts` is nudged past the newest entry so it can be found again. */
export function appendGame(game: LogGame): LogGame {
  const games = loadLog();
  const last = games.length ? games[games.length - 1].ts : 0;
  const entry = { ...game, ts: Math.max(game.ts, last + 1) };
  games.push(entry);
  saveLog(games);
  return entry;
}

/** Take a game back out (UNDO from the end screen). */
export function removeGame(ts: number): void {
  const games = loadLog();
  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i].ts === ts) {
      games.splice(i, 1);
      saveLog(games);
      return;
    }
  }
}

/** Record what a stumped player was thinking of. */
export function setActual(ts: number, actual: LogActual): void {
  const games = loadLog();
  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i].ts === ts) {
      games[i] = { ...games[i], actual };
      saveLog(games);
      return;
    }
  }
}

export function clearLog(): void {
  saveLog([]);
}

/** The file "Export my games" downloads: the log exactly as stored. */
export function exportJson(): string {
  return JSON.stringify({ v: 1, games: loadLog() }, null, 1) + "\n";
}
