// In-memory KB patches for the review lab. Each returns a new KB; kb.json is never written here.
import type { KB, Thing } from "../../src/engine/types";

const mapThings = (kb: KB, f: (t: Thing) => Thing): KB => ({ ...kb, things: kb.things.map(f) });
const demote = (t: Thing, ids: string[]): Thing => {
  const hit = ids.filter((id) => t.yes.includes(id));
  if (!hit.length) return t;
  return { ...t, yes: t.yes.filter((id) => !hit.includes(id)), maybe: [...(t.maybe ?? []), ...hit] };
};

export const PATCHES: Record<string, (kb: KB) => KB> = {
  /**
   * People rows were written from one template that answers the animal-style movement questions literally:
   * 55 of 63 people are YES on climbs, 53 on hops_jumps, 58 on lives_in_groups. A player thinking of a doctor
   * or a king answers those No or Sometimes. By the SPECS 3 rule (maybe when players would honestly split)
   * they are maybe. Class-level rule over every is_person row; family and team keep lives_in_groups.
   */
  people: (kb) =>
    mapThings(kb, (t) => {
      if (!t.yes.includes("is_person")) return t;
      const ids = ["climbs", "hops_jumps"];
      if (t.id !== "family" && t.id !== "team") ids.push("lives_in_groups");
      return demote(t, ids);
    }),
  /**
   * Stand-in for a curated "things players pick most" flag, taken from how the KB was built rather than from any
   * sheet: the first 212 things (the v1 everyday set) and the 349 v9 additions (chosen by how often people pick
   * them) are common; the 782 things of the v8 growth to 1,000 are not.
   */
  common: (kb) => ({ ...kb, things: kb.things.map((t, i) => (i < 212 || i >= 994 ? { ...t, common: true } : t)) }),
  /**
   * A thing the KB marks YES on all six continent questions is found everywhere (cow, dog, ant, every person),
   * so "Is it found in Africa?" tells the engine nothing true about it, and a player who answers No (or only
   * thinks of where they live) is charged a hard contradiction each time. Those six cells become `unknown`:
   * no penalty either way, and the engine stops asking continents to split worldwide things.
   */
  worldwide: (kb) =>
    mapThings(kb, (t) => {
      if (!CONTINENTS.every((id) => t.yes.includes(id))) return t;
      return { ...t, yes: t.yes.filter((id) => !CONTINENTS.includes(id)), unknown: [...(t.unknown ?? []), ...CONTINENTS] };
    }),
  /** Only the six continent questions flagged soft (the engine-side alternative to `worldwide`). */
  softContinents: (kb) => ({ ...kb, questions: kb.questions.map((q) => (CONTINENTS.includes(q.id) ? { ...q, soft: true } : q)) }),
  /**
   * Questions that are a matter of opinion, scale or geography, chosen by reading the question list (not fitted):
   * continents, colours, and relative words such as valuable, fast, soft, dangerous, every day.
   */
  soft: (kb) => ({ ...kb, questions: kb.questions.map((q) => (SOFT.has(q.id) ? { ...q, soft: true } : q)) }),
};

export const CONTINENTS = ["lives_in_africa", "lives_in_asia", "lives_in_australia", "lives_in_north_america", "lives_in_south_america", "lives_in_europe"];
export const SOFT = new Set(
  `lives_in_africa lives_in_asia lives_in_australia lives_in_north_america lives_in_south_america lives_in_europe
   is_green is_red is_yellow_orange is_brown is_white is_black is_colorful is_dark is_shiny
   used_daily is_valuable found_in_house found_outdoors is_dangerous is_fast is_slow is_soft is_breakable is_tall
   is_hot is_cold is_wet is_nocturnal lives_in_groups hops_jumps climbs people_visit_for_fun lives_in_cold_places
   bigger_than_breadbox heavier_than_person`.split(/\s+/).filter(Boolean),
);
