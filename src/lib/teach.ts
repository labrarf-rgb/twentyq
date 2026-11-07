// v9 (SPECS 11.3): what the stump-screen box accepts and suggests.
import { normalizeName, type KB, type LogActual } from "@/engine";

/** A name is at most this long. */
export const NAME_MAX = 24;
/** One LCD line holds 24 characters, and a guess line puts "." right after the name, so a word is at most 23. */
export const WORD_MAX = 23;
export const SUGGESTION_MAX = 5;

/** Typing filter: curly quotes become plain ones, anything but letters, digits, spaces, ' and - is dropped. */
export function filterTyping(raw: string): string {
  return raw
    .replace(/[‘’]/g, "'")
    .replace(/[‐-―]/g, "-")
    .replace(/[^A-Za-z0-9 '-]/g, "")
    .replace(/^ +/, "")
    .replace(/ {2,}/g, " ")
    .slice(0, NAME_MAX);
}

/** The text to record, or null if it is not an allowed name. */
export function cleanName(raw: string): string | null {
  const t = filterTyping(raw).trim();
  if (!t || !/[A-Za-z0-9]/.test(t)) return null;
  if (t.length > NAME_MAX) return null;
  if (t.split(" ").some((w) => w.length > WORD_MAX)) return null;
  return t;
}

export interface Suggestion {
  label: string;
  actual: LogActual;
}

/** Names the player can pick: every KB thing, then learned things in log order. */
export interface NameBook {
  kb: KB;
  learned: { name: string }[];
}

function startsAnyWord(name: string, q: string): { whole: boolean; any: boolean } {
  const n = name.toLowerCase();
  if (n.startsWith(q)) return { whole: true, any: true };
  const words = n.split(/[ \-]/);
  for (const w of words) if (w.startsWith(q)) return { whole: false, any: true };
  // a query with a space ("ice c") can start in the middle of the name
  return { whole: false, any: n.includes(" " + q) || n.includes("-" + q) };
}

/** Up to 5 matches, case-insensitive, at the start of any word. Whole-name starts come first, then KB order, then learned. */
export function suggest(book: NameBook, text: string): Suggestion[] {
  let q = text.trim().toLowerCase().replace(/\s+/g, " ");
  for (const art of ["a ", "an ", "the "]) {
    if (q.startsWith(art) && q.length > art.length) {
      q = q.slice(art.length);
      break;
    }
  }
  if (!q) return [];
  const hits: { s: Suggestion; whole: boolean; order: number }[] = [];
  book.kb.things.forEach((t, i) => {
    const m = startsAnyWord(t.name, q);
    if (m.any) hits.push({ s: { label: t.name, actual: { id: t.id } }, whole: m.whole, order: i });
  });
  const base = book.kb.things.length;
  book.learned.forEach((l, i) => {
    const m = startsAnyWord(l.name, q);
    if (m.any) hits.push({ s: { label: l.name, actual: { name: l.name } }, whole: m.whole, order: base + i });
  });
  hits.sort((a, b) => Number(b.whole) - Number(a.whole) || a.order - b.order);
  return hits.slice(0, SUGGESTION_MAX).map((h) => h.s);
}

/** What typing `text` and pressing Teach me records: a KB thing if the name matches one exactly, else the typed name. */
export function resolveTyped(book: NameBook, text: string): LogActual {
  const name = cleanName(text);
  if (!name) return null;
  const key = normalizeName(name);
  const t = book.kb.things.find((x) => normalizeName(x.name) === key);
  return t ? { id: t.id } : { name };
}
