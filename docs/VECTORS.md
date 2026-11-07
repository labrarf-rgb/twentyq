# Test vectors and the v9 learning engine: port notes

For the Android port of SPECS §11.1 to §11.3. SPECS.md is the contract; this file records the
exact choices the TypeScript reference engine makes where the spec leaves room, and the format
of `kb/test-vectors.json`. If this file and the reference engine (`src/engine/`) ever disagree,
the engine wins and this file is a bug.

## 1. The vector file

```jsonc
{
  "kbVersion": "…",          // must equal kb.json's kbVersion
  "format": "…",             // pointer to this file
  "prng": [ { "seed": 42, "first": [ /* 10 doubles */ ] }, … ],
  "games": [ { … } ]
}
```

One game:

| Field | Meaning |
|---|---|
| `name` | label |
| `seed` | engine seed (32-bit signed int) |
| `learned` | **optional.** A game log's `games` array (SPECS §11.1 shape), applied before the game is played. Absent means an empty log. |
| `answers` | tokens, including `back`. Category and question turns: `yes`, `no`, `maybe`, `skip`. Guess turns: `right`, `wrong`. |
| `thingCount` | only with `learned`: total things (KB things plus learned things) |
| `learnedThings` | only with `learned`: `[{id, name}]`, the learned things in order. Check this first: if it matches, your log compile is right. |
| `expect` | the turns after all `back`s are applied, then the pending turn. `{turn, kind, id}`: a category id (`animal`), a question id, or a **thing id**. A learned thing's id is `learned:` plus its key (below). |
| `result` | `{outcome: "win"|"stumped", turn}` |
| `finalWeightsTop3` | `[thingId, weight]`, tolerance 1e-9. Thing ids can be learned ids. |

How the tests use a game: compile `(kb, learned ?? [])`, replay `applyBacks(answers)` with
`seed`, compare `expect`, `result`, and the top 3 weights. The `learned` coverage games are
`learned-*` (seven of them): a learned thing guessed by name, counts that change the questions
asked, the same new name in different spellings, unusable log games that must change nothing,
a name that matches a KB thing, a `near` list with a stale id (and a thing whose only `near`
entry is stale, so it falls back to `no`), and a rich-profile thing that borrows from its `near`.

## 2. Compiling a log (what `compileKB(kb, log)` does)

**Order matters; nothing may depend on map iteration order.**

1. **Resolve each log game to a thing.** Walk `log` in order. Skip a game whose `actual` is
   `null`, or whose `turns` is not a list. Otherwise:
   - `actual.id`: the KB thing with that id. Not in the KB: the game is **ignored entirely**.
   - `actual.name`: `key = normalize(name)`. An empty key: ignored. If a KB thing has the same
     normalized `name`, the game is for that KB thing (the lowest index wins if two match).
     Otherwise it is a **learned thing**: new key, new thing appended after the KB things, in
     order of the first game that names it. Its `id` is `"learned:" + key`. Its display name is
     that first game's `name`, trimmed (nothing else: case and inner spacing are kept).
2. **normalize(name)**: trim, collapse every run of whitespace to one space, lowercase, then
   drop **one** leading `"a "`, `"an "` or `"the "` (checked in that order, once), then trim.
   `"A-frame"` keeps its `a` because there is no space after it. A name that is just `"a"` stays `"a"`.
3. **Learned things borrow from look-alikes** (SPECS §11.2, replacing the earlier `unknown` and `no`
   bases). The **first** log game that names a learned thing supplies its `near` list, `[[thing id,
   weight], ...]`. Build the thing's borrowed base like this:
   - keep only entries whose id is a **KB thing id of this KB** (a learned id, an unknown id, a
     non-array entry, a non-number weight or a weight that is not above 0 is dropped)
   - `S` = the kept weights added up in list order; if nothing is kept or `S` is not above 0, the
     thing has **no usable near** and its base for every cell is `lik[a][no]` (yes 0.05, maybe 0.3, no 0.85)
   - otherwise `w_k = weight_k / S` (each divided by the same `S`), and for each cell and answer
     `b(a) = Σ_k w_k * lik[a][value(near_k, cell)]`, summed in list order starting from `0.0`, where
     `value(near_k, q)` is the KB value of that KB thing for question `q` and `value(near_k, c)` is
     `cv(near_k, c)` for category question `c`
   - only the **first** game that names the thing counts for `near`; if that game has no `near`
     field, the thing has no usable near (do not look at later games)
   `values[]` and `cats[]` rows of a learned thing are placeholders (the `no` code) and are never read by
   the engine: `P` is what it uses. Categories and questions are separate cells with their own counts.
4. **Counts.** For each resolved game, for each turn `{id, a}` with `a` in `yes|maybe|no`:
   - `id` starting `cat:` → category column `cat:` + category id, only for the first three
     categories (animal, vegetable, mineral)
   - `id` starting `guess:` → never counted
   - otherwise a question id of **this** KB; an unknown id is skipped (the KB changed since)
   - `counts[thing][column][a] += 1`. `skip`, `right`, `wrong` are never counted.
5. **Probability**, per thing `i`, column (question `q` or category `c`) and answer `a` in
   `yes, maybe, no` (index 0, 1, 2). `b = lik[a][value(i, column)]` for a KB thing, where `value` is the KB
   value (`cv(i, c)` for categories), or the borrowed `b(a)` above for a learned thing, `n = c_yes + c_maybe + c_no`:
   - `n == 0`: `P = b`, **the table value (or, for a learned thing, the borrowed mix) with no further arithmetic**. Never write `(K*b + 0)/(K + 0)`:
     the result is not always bit-identical, and the pre-v9 vectors depend on it.
   - otherwise `P = (K * b + c_a) / (K + n)`, evaluated in that order in doubles
     (`K` is `kb.engine.learnPriorStrength` as a double, `c_a` and `n` converted from ints).
     If a KB has no `learnPriorStrength`, use 2.
6. `N = KB things + learned things`. Every weight starts at `1 / N`.

The engine otherwise runs exactly as SPECS §4, with `P(i, q, a)` wherever `L[a][v(i,q)]` was
used: applying answers, the category phase and the gain loop. **Runner-ups on the stumped
screen are always the top 3**, whatever `topK` is tuned to (the reference engine hard-codes 3).

## 3. Things the UI must also do, so the log feeds the engine correctly

- **Freeze the compile per game.** Compile once when a game starts. UNDO from the end screen
  replays with that same compile, and a game never learns from itself.
- **When a game ends,** append `{ts, kbVersion, outcome, turn, turns, actual}`:
  - `turns` are the final recap entries: `cat:<category>`, `<question id>`, `guess:<thing id>`,
    each with the answer token. Learned things appear as `guess:learned:<key>`.
  - a **win** records `actual` as the guessed thing: `{id}` for a KB thing, but `{name}` (its
    display name) for a learned thing, because a `learned:` id is not a KB id and would be ignored.
  - a **stumped** game records `actual: null` until the player teaches it.
- **Writing `near`.** When a game's `actual` is a **name that matches no KB thing** (the teach box with
  new text, or a win on a learned thing), also store `near`, computed from that game's own answers:
  start every thing of the compile the game was played on at `1 / N`; for each category or question
  turn answered `yes`, `maybe` or `no` (not `skip`; **guess turns are ignored**, so a wrongly guessed
  look-alike still counts), multiply each weight by that answer's `P` and normalize in index order;
  then take the **KB things only**, drop weights that are not above 0, sort by weight descending with
  ties to the lower index, keep the first 5, renormalize over those 5 and round each to 4 decimals with
  round-half-up (`Math.round(x * 1e4) / 1e4`). Store `[[id, w], ...]`, highest first. The teach box
  computes it when the player teaches a name, not when the game ends. (`src/engine/near.ts`.)
- **UNDO from the end screen** removes that game's entry (the reference finds it by `ts`).
- The log keeps the most recent 1,000 games.
- **Teach box copy.** Placeholder `a dragon`, and a quiet hint under the field: `Add a, an or the if it needs one.` The app never adds an article.
- **Teach box limits.** At most 24 characters; letters, digits, spaces, apostrophes and
  hyphens only (curly quotes become plain ones); at least one letter or digit; **no word longer
  than 23 characters** (the guess line puts a `.` straight after the name, so a 24-letter word
  would not fit the 24-character LCD line). Suggestions: up to 5, matching the start of any
  word, whole-name starts first, then KB order, then learned names.
- **`proper` (KB display flag, SPECS §3):** a KB thing with `proper: true` is shown as `article + " " +
  name` exactly as written ("the Easter Bunny"); otherwise the first letter of the name is lowercased. The
  engine ignores it.
- **Guess line for a learned thing:** `"I think it's " + name + ". Am I right?"` with the name
  exactly as typed: no article added, no lowercasing. (`thingPhrase` for learned things.)
- The worst-case guess lines (one 23-letter word, 12 + 11, and a many-short-words shape) are in
  the web fit check; no legal name wraps to more than 3 LCD lines.
