import { describe, expect, it } from "vitest";
import { checkKB } from "./kb-check";

const base = () => ({
  schemaVersion: 2,
  kbVersion: "t",
  engine: { learnPriorStrength: 2 },
  categories: ["animal", "vegetable", "mineral", "other"],
  questions: ["is_alive", "is_mammal", "has_legs", "has_four_legs", "can_hold", "bigger_than_breadbox", "x"].map((id) => ({
    id,
    text: id,
    group: "g",
  })),
  things: [
    { id: "a", name: "A", article: "a", category: "animal", yes: ["is_alive", "is_mammal"] },
    { id: "b", name: "B", article: "a", category: "animal", yes: ["is_alive"] },
  ],
});

const errs = (kb: unknown) => checkKB(kb).errors.join("\n");

describe("checkKB", () => {
  it("accepts a valid kb", () => expect(checkKB(base()).errors).toEqual([]));
  it("rejects wrong schemaVersion", () => expect(errs({ ...base(), schemaVersion: 1 })).toMatch(/schemaVersion/));
  it("rejects the removed engine.category block", () =>
    expect(errs({ ...base(), engine: { learnPriorStrength: 2, category: { match: 0.9 } } })).toMatch(/engine\.category/));
  it("needs engine.learnPriorStrength from 1 to 4 (v9)", () => {
    expect(errs({ ...base(), engine: {} })).toMatch(/learnPriorStrength/);
    expect(errs({ ...base(), engine: { learnPriorStrength: 0.5 } })).toMatch(/learnPriorStrength/);
    expect(errs({ ...base(), engine: { learnPriorStrength: 5 } })).toMatch(/learnPriorStrength/);
    expect(errs({ ...base(), engine: { learnPriorStrength: 4 } })).toBe("");
  });
  it("accepts proper as an optional boolean (v9), and rejects anything else", () => {
    const kb = base();
    (kb.things[0] as Record<string, unknown>).proper = true;
    expect(errs(kb)).toBe("");
    (kb.things[0] as Record<string, unknown>).proper = "yes";
    expect(errs(kb)).toMatch(/proper must be true or false/);
  });
  it("rejects unknown question ids", () => {
    const kb = base();
    kb.things[0].yes.push("nope");
    expect(errs(kb)).toMatch(/unknown question id "nope"/);
  });
  it("rejects a question in two lists", () => {
    const kb: any = base();
    kb.things[0].maybe = ["is_alive"];
    expect(errs(kb)).toMatch(/both yes and maybe/);
  });
  it("rejects duplicate thing ids, names and question ids", () => {
    const kb = base();
    kb.things[1].id = "a";
    kb.things[1].name = "a";
    kb.questions.push({ id: "x", text: "x", group: "g" });
    const e = errs(kb);
    expect(e).toMatch(/duplicate thing id/);
    expect(e).toMatch(/duplicate thing name/);
    expect(e).toMatch(/duplicate question id/);
  });
  it("rejects bad category, altCategories and article", () => {
    const kb: any = base();
    kb.things[0].category = "plasma";
    kb.things[1].altCategories = ["nope"];
    kb.things[1].article = "some";
    const e = errs(kb);
    expect(e).toMatch(/invalid category/);
    expect(e).toMatch(/invalid altCategories/);
    expect(e).toMatch(/invalid article/);
  });
  it("rejects implication breaks", () => {
    const kb = base();
    kb.things[0].yes = ["has_four_legs", "is_mammal"];
    kb.things[1].yes = ["is_alive"];
    const e = errs(kb);
    expect(e).toMatch(/has_four_legs=yes implies has_legs=yes/);
    expect(e).toMatch(/is_mammal=yes implies is_alive=yes/);
  });
  it("rejects can_hold with bigger_than_breadbox", () => {
    const kb = base();
    kb.things[0].yes = ["can_hold", "bigger_than_breadbox"];
    expect(errs(kb)).toMatch(/both yes/);
  });
  it("rejects indistinguishable pairs and warns on near-identical ones", () => {
    const kb = base();
    kb.things[1].yes = ["is_alive", "is_mammal"];
    expect(errs(kb)).toMatch(/indistinguishable pair: a \/ b/);
    kb.things[1].yes = ["is_alive"];
    expect(checkKB(kb).warnings.join("\n")).toMatch(/differs on only 1/);
  });
  it("warns on the v10 class rules: worldwide continents, people who climb, jump or live in groups", () => {
    const continents = ["lives_in_africa", "lives_in_asia", "lives_in_australia", "lives_in_north_america", "lives_in_south_america", "lives_in_europe"];
    const kb = base();
    kb.questions.push(...[...continents, "is_person", "climbs", "hops_jumps", "lives_in_groups"].map((id) => ({ id, text: id, group: "g" })));
    kb.things.push(
      { id: "cow", name: "Cow", article: "a", category: "animal", yes: ["is_alive", ...continents] },
      { id: "king", name: "King", article: "a", category: "other", yes: ["is_alive", "is_person", "climbs", "lives_in_groups"] },
      { id: "team", name: "Team", article: "a", category: "other", yes: ["is_alive", "is_person", "lives_in_groups"] },
    );
    const w = checkKB(kb).warnings.join("\n");
    expect(w).toMatch(/cow is yes on all six continent questions/);
    expect(w).toMatch(/king is a person and yes on climbs, lives_in_groups/);
    expect(w).not.toMatch(/team is a person/);
  });
  it("warns on things with fewer than 6 yes entries", () => {
    expect(checkKB(base()).warnings.join("\n")).toMatch(/only 2 yes entries/);
  });
});
