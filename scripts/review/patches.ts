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
};
