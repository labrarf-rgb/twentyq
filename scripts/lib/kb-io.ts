import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { KB } from "../../src/engine/types";

export const KB_PATH = fileURLToPath(new URL("../../kb/kb.json", import.meta.url));
export const VECTORS_PATH = fileURLToPath(new URL("../../kb/test-vectors.json", import.meta.url));

export function loadKB(path = KB_PATH): KB {
  return JSON.parse(readFileSync(path, "utf8")) as KB;
}
