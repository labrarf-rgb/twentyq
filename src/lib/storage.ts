// localStorage that never throws and falls back to memory (private windows, tests).
const mem = new Map<string, string>();

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? mem.get(key) ?? null;
  } catch {
    return mem.get(key) ?? null;
  }
}

export function writeStore(key: string, value: string): void {
  mem.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* memory copy is enough */
  }
}
