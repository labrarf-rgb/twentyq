// v9 (SPECS 11.2): turn a game log into learned things and answer counts.
// Pure and deterministic: everything below is plain index-order arithmetic. Maps are only ever
// looked up by key, never iterated, so the result does not depend on iteration order.
import type { KB, LogActual, LogGame } from "./types";

/** Normalized name: lowercase, trimmed, inner whitespace collapsed, a leading "a ", "an " or "the " dropped. */
export function normalizeName(name: string): string {
  let s = name.trim().replace(/\s+/g, " ").toLowerCase();
  for (const art of ["a ", "an ", "the "]) {
    if (s.startsWith(art)) {
      s = s.slice(art.length);
      break;
    }
  }
  return s.trim();
}

export interface LearnedThing {
  /** "learned:" + normalized key */
  id: string;
  key: string;
  /** The text from the first log game that names it, trimmed. */
  name: string;
  /** `near` from that first game: the KB things it resembles, as given (validated when compiled). */
  near: [string, number][] | undefined;
}

export interface Counts {
  /** Learned things, in order of the first log game that names them. */
  learned: LearnedThing[];
  /** Per counted game: its thing index (KB index, or nKb + learned ordinal) and its turns. */
  games: { thing: number; game: LogGame }[];
}

/** Resolve every log game to a thing index. Games with no usable `actual` are dropped. */
export function resolveLog(kb: KB, log: readonly LogGame[]): Counts {
  const nKb = kb.things.length;
  const idIndex = new Map<string, number>();
  const nameIndex = new Map<string, number>();
  kb.things.forEach((t, i) => {
    idIndex.set(t.id, i);
    const key = normalizeName(t.name);
    if (key && !nameIndex.has(key)) nameIndex.set(key, i);
  });
  const learned: LearnedThing[] = [];
  const learnedIndex = new Map<string, number>();
  const games: Counts["games"] = [];
  for (const game of log) {
    const actual: LogActual | undefined = game?.actual;
    if (!actual || !Array.isArray(game.turns)) continue;
    let thing = -1;
    if ("id" in actual && typeof actual.id === "string") {
      const i = idIndex.get(actual.id);
      if (i === undefined) continue; // not in this KB: ignored
      thing = i;
    } else if ("name" in actual && typeof actual.name === "string") {
      const key = normalizeName(actual.name);
      if (!key) continue;
      const k = nameIndex.get(key);
      if (k !== undefined) thing = k;
      else {
        let l = learnedIndex.get(key);
        if (l === undefined) {
          l = learned.length;
          learned.push({ id: "learned:" + key, key, name: actual.name.trim(), near: Array.isArray(game.near) ? game.near : undefined });
          learnedIndex.set(key, l);
        }
        thing = nKb + l;
      }
    } else continue;
    games.push({ thing, game });
  }
  return { learned, games };
}

/** The KB thing whose normalized name equals the normalized `name`, or -1. Lowest index wins. */
export function kbThingByName(kb: KB, name: string): number {
  const key = normalizeName(name);
  if (!key) return -1;
  for (let i = 0; i < kb.things.length; i++) if (normalizeName(kb.things[i].name) === key) return i;
  return -1;
}
