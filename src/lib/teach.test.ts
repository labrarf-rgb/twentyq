import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { KB } from "@/engine";
import { cleanName, filterTyping, NAME_MAX, resolveTyped, suggest, WORD_MAX } from "./teach";

const kb: KB = JSON.parse(readFileSync(new URL("../../kb/kb.json", import.meta.url), "utf8"));
const book = { kb, learned: [{ name: "Zorp Blat" }, { name: "Cattle prod" }] };

describe("names the box accepts", () => {
  it("filters to letters, digits, spaces, apostrophes and hyphens, at most 24 characters", () => {
    expect(filterTyping("  Ray’s <b>dog</b>!!")).toBe("Ray's bdogb");
    expect(filterTyping("a".repeat(40))).toHaveLength(NAME_MAX);
    expect(filterTyping("hot   dog")).toBe("hot dog");
  });
  it("rejects empty, symbol-only and over-long words", () => {
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("- ' -")).toBeNull();
    expect(cleanName("w".repeat(WORD_MAX + 1))).toBeNull();
    expect(cleanName("w".repeat(WORD_MAX))).toBe("w".repeat(WORD_MAX));
    expect(cleanName(" a dragon ")).toBe("a dragon");
  });
});

describe("suggestions", () => {
  it("gives at most 5, matching the start of any word, case-insensitively", () => {
    const s = suggest(book, "CAT");
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) expect(x.label.toLowerCase()).toMatch(/(^|[ -])cat/);
    expect(suggest(book, "blat")[0]).toEqual({ label: "Zorp Blat", actual: { name: "Zorp Blat" } });
    expect(suggest(book, "")).toEqual([]);
  });
  it("lists whole-name starts first and records KB things by id", () => {
    const s = suggest(book, "a cat");
    expect(s[0]).toEqual({ label: "Cat", actual: { id: "cat" } });
  });
});

describe("resolving typed text", () => {
  it("an exact KB name (ignoring a leading article) records the id; anything else records the name", () => {
    expect(resolveTyped(book, "the CAT")).toEqual({ id: "cat" });
    expect(resolveTyped(book, "  a Zorp  ")).toEqual({ name: "a Zorp" });
    expect(resolveTyped(book, "!!!")).toBeNull();
  });
});
