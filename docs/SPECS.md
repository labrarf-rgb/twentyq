# Twenty Q: Shared Spec

> **This file is identical in both repos.** `TwentyQ-wa` is the web app and `TwentyQ-aa` is
> the Android app. Change it only through the coordinator session, which copies it to both
> repos. Each repo keeps its own dated log in `docs/SESSIONS.md`.

Last spec update: 2026-10-31 (v1, initial).

---

## 1. What it is

Twenty Q is a twenty questions game in the spirit of the 90s handheld toy.
- **You think of something.** The app asks questions and you answer with
  **Yes / No / Maybe / Skip**. It tries to guess within 20 questions.
- **One mode only.** The app is always the one guessing.
- **Fully offline.** There is no server, API key, account, analytics, or learning.
- **One knowledge base drives both apps.** It is the shared file `kb.json`, with one shared
  engine algorithm, so the same answers produce the same game on both platforms.

| | Web | Android |
|---|---|---|
| Repo | `~/WebAppProjects/TwentyQ-wa` | `~/AndroidStudioProjects/TwentyQ-aa` |
| Stack | Vite + React 19 + TypeScript + Zustand + Tailwind v4 (tokens as CSS variables + `@theme`), Vitest | Kotlin + Jetpack Compose (Material 3, themed to our tokens), single activity, JUnit |
| IDs | — | `applicationId` / `namespace` `com.labrarf.twentyq`, minSdk 29, targetSdk 36, versionCode = git commit count (copy the `gitCount` approach from `~/AndroidStudioProjects/Estoria-aa/app/build.gradle.kts`) |
| Ships to | `~/Portfolio-Website/twentyq` via `npm run deploy` (labrarf.com/twentyq). Follow `~/Portfolio-Website/SITE-GUIDE.md` and Estoria's `scripts/deploy.sh`. Vite `base: '/twentyq/'`. | Local debug builds. Play internal testing later. |
| KB copy | **Master copy** at `kb/kb.json` | Exact copy at `app/src/main/assets/kb.json` |

**Look:** Ray's papery design language. Load the `design-pref-rfcl` skill before any UI work.

---

## 2. Game flow

Every step of the game is a **turn**, numbered 1 to 25. A turn is either a question or a
guess, and the big counter on screen shows the turn number ("Q7").

1. **Home.**
   - The title "Twenty Q" and the line "Think of something. I'll read your mind in twenty questions."
   - A **Play** button.
   - A "How to play" link that opens a short sheet: think of an object, animal, or plant;
     answer honestly; Maybe means sometimes or partly; Skip means you don't know or it
     doesn't apply.
   - A small stats line: games played, and how often you stumped it.
2. **Turn 1 is always the category question:** *"Is it an animal, vegetable, mineral, or other?"*
   - Buttons: **Animal · Vegetable · Mineral · Other · Skip**.
   - The how-to sheet explains the categories:
     - Animal: any animal, or something mostly made from one (leather, wool, egg).
     - Vegetable: a plant, or something made from plants (fruit, bread, wood, paper, cotton).
     - Mineral: non-living, and not from a plant or animal (metal, stone, glass, plastic).
     - Other: places, weather, ideas, and things that don't fit cleanly.
3. **Question turns.** The screen shows the question text and four buttons:
   **Yes · No · Maybe · Skip**. A **Back** control undoes the last turn, whether it was a
   question or a guess, back to turn 1.
4. **Guess turns.** The app says *"I think it's {article} {name}."* (for example
   "I think it's a cat.", "I think it's the moon.", "I think it's bread.").
   - Buttons: **Right · Wrong**. Back is available here too.
   - Right ends the game as a win for the app.
   - Wrong removes that thing and play continues.
5. **Overtime.**
   - From turn 20 on, every turn is a guess.
   - If the turn-20 guess is wrong, the app gets turns 21 to 25. It shows the line
     *"Hmm. Give me five more."* once, when turn 21 starts.
6. **End screen.**
   - App wins: *"I got it in {turn}!"*
   - Stumped (wrong at turn 25, or no candidates left): *"You stumped me!"*, followed by
     *"Were you thinking of…"* and the top 3 remaining things by weight. These are
     informational only: tapping one records nothing.
   - Both show a recap: every turn's question or guess with your answer. Then **Play again**
     and **Home**.

**Stats** are stored locally (web `localStorage`, Android DataStore). Fields: `played`,
`appWins`, `stumped`, and `totalTurnsOnWins`. The Home line shows "Played 12 · You stumped me 3 times".
A game counts once it reaches the end screen; quitting halfway counts nothing.

**Keyboard on web:** `Y` Yes, `N` No, `M` Maybe, `S` Skip, `Backspace` Back.
- Turn 1: `A` Animal, `V` Vegetable, `I` Mineral, `O` Other, `S` Skip.
- Guess turns: `Y` / `Enter` Right, `N` Wrong.

---

## 3. Knowledge base: `kb.json` (the contract)

Schema version 1. **The web repo owns the master copy (`kb/kb.json`).** Android copies it
byte for byte with `tools/sync-kb.sh`, which copies `kb/kb.json` and
`kb/test-vectors.json` from `../../WebAppProjects/TwentyQ-wa`. Nobody edits the Android copy
by hand. A schema change needs both apps updated together, through the coordinator.

```jsonc
{
  "schemaVersion": 1,
  "kbVersion": "seed-2026.11.01",          // bump on every content change
  "categories": ["animal", "vegetable", "mineral", "other"],
  "engine": { ... },                        // §4 constants; both engines read these, never hard-code them
  "questions": [
    { "id": "can_fly", "text": "Can it fly?", "group": "movement" }
  ],
  "things": [
    { "id": "cat", "name": "Cat", "article": "a", "category": "animal",
      "altCategories": [],                  // optional: categories a reasonable player might also pick
      "yes":     ["is_alive", "has_fur"],   // answer is Yes
      "maybe":   ["is_nocturnal"],          // answer is sometimes / partly / it depends
      "unknown": [] }                       // optional: genuinely unclear; the engine treats it as uninformative
  ]
}
```

- **Values.** Every (thing, question) pair is one of `yes | maybe | no | unknown`.
  Unlisted pairs are **no**.
- **`article`** is `"a"`, `"an"`, `"the"`, or `""`. The guess line reads
  `"I think it's " + (article ? article + " " : "") + lowercase-first(name) + "."`.
  Lowercasing applies only to the first letter, so names keep their own internal capitals.
- **Order is meaningful.** Question order in the array breaks ties (§4), and thing order is
  each thing's index. Don't re-sort casually: any reorder means regenerating the test vectors.
- **Seed.** The current file has 96 questions and 36 seed things. The web session expands it
  to **about 200 things**:
  - roughly 70 animal, 50 vegetable, 60 mineral, 20 other
  - everyday things a 10-year-old would think of first: dog, pizza, chair, phone, tree, car, moon
  - questions added only when they separate things the existing ones can't. Never remove or
    rename a question id without the coordinator.
- **Accuracy matters more than size.** Answer each pair the way most people would answer
  about the typical version of the thing:
  - **maybe** when real players would honestly split (color of a cat, "does a car use electricity").
  - **unknown** only when the question barely makes sense for the thing.
  - Always mark the obvious yeses: a dog `has_tail`, a car `makes_sound`.

### Validator: `npm run kb:check` (web)

It fails on any of these:
- invalid JSON or wrong `schemaVersion`
- an unknown question id in any list
- the same question in two lists for one thing
- a duplicate thing id, thing name, or question id
- an invalid `category`, `altCategories` entry, or `article`
- **implication breaks**, each meaning "if the thing has the first as yes, the second must also be yes":
  - `bigger_than_car` → `bigger_than_breadbox`
  - `has_four_legs` → `has_legs`
  - each of `is_mammal | is_bird | is_fish | is_reptile | is_insect` → `is_alive`
  - each of `is_fruit | is_vegetable_food | is_drink` → `is_food`
  - `has_screen` → `uses_electricity`
- **contradictions:** both `can_hold` and `bigger_than_breadbox` as yes
- **indistinguishable pairs:** two things whose full answer vectors are identical

It warns on:
- pairs that differ on fewer than 3 questions
- questions where 95% or more of things give the same value
- things with fewer than 6 `yes` entries

---

## 4. Engine (identical on both platforms)

The engine is a pure module with no UI or platform imports:
- web: `src/engine/`
- Android: `com.labrarf.twentyq.engine`

It is a function of `(kb, seed, answerHistory)`, which makes Back an exact replay.

**Constants** come from `kb.engine`: `likelihood`, `category`, `guessConfidence` (0.80),
`guessMinTurn` (8), `forceGuessTurn` (20), `maxTurns` (25), `topK` (3).

### State
- `w[i]` is the weight of thing `i`, a double. It starts at `1 / N` for every thing.
- `asked` is the set of question indices asked so far.
- `guessed` is the set of thing indices guessed wrong. Each guessed index gets `w[i] = 0`.
- `rng` is mulberry32 seeded with the game's 32-bit `seed`. A new seed is drawn per game
  from the platform RNG.

### Normalize
After every update: `s = Σ w[i]`, then `w[i] = w[i] / s` for each `i`, summing in index order.
If `s == 0`, the game ends as **stumped**.

### Turn 1: category
For each thing `i`, multiply `w[i]` by:
- `category.match` if the answer equals `category[i]`
- `category.alt` if the answer is in `altCategories[i]`
- `category.other` otherwise

Skip leaves the weights unchanged. Then normalize.

### Deciding what turn `t` is (t ≥ 2)
1. Let `top` be the index of the highest `w`. Ties go to the lowest index.
2. If `t >= forceGuessTurn`, turn `t` is a **guess of `top`**.
3. Otherwise, if `t >= guessMinTurn` and `w[top] >= guessConfidence`, it is also a
   **guess of `top`**.
4. Otherwise it is a **question**, chosen as below. If every question has been asked, it is a
   guess of `top`.

### Choosing a question
- **Entropy:** `H(p) = -Σ p_i · ln(p_i)` over `p_i > 0`, summing in index order. Android must
  use `StrictMath.log` (it matches V8's `Math.log`, which is an fdlibm port). Kotlin's `ln`
  and `Math.log` are not allowed here.
- **Gain** for each unasked question `q`:
  ```
  E = 0
  for a in [yes, maybe, no]:
     u_i = w[i] · L[a][v(i,q)]
     P_a = Σ u_i
     if P_a > 0:  E += P_a · H(u / P_a)
  gain(q) = H(w) − E
  ```
  Skip is left out because it carries no information. `v(i,q)` is the thing's value for that
  question, and `L` is `engine.likelihood`.
- **Ranking:** sort the unasked questions by gain, highest first. Treat two gains as tied when
  `|g1 − g2| < 1e-9`, and break ties by lower question index. This epsilon absorbs last-ulp
  float differences between the platforms.
- **Pick:** `k = min(topK, count)` and `r = rng.next()`, then take the item at rank
  `floor(r · k)`. **Draw from the RNG exactly once per question turn**, including when
  `k == 1`, and never on guess turns or turn 1.

### Applying answers
- **Yes / Maybe / No** to question `q`: multiply each `w[i]` by `L[answer][v(i,q)]`, then normalize.
- **Skip:** no weight change. `q` still counts as asked and the turn is spent.
- **Right:** the game ends as an app win at turn `t`.
- **Wrong:** `w[top] = 0`, add `top` to `guessed`, and normalize. If `t == maxTurns`, the game
  ends as stumped.

**Runner-ups** on the stumped screen are the top 3 by `w` among things not in `guessed`.
Ties go to the lower index.

### mulberry32 (reference, TypeScript)
```ts
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```
On Kotlin, use `Int` arithmetic: wrap-around multiply replaces `Math.imul`, and `ushr`
replaces `>>>`. Turn the result into an unsigned value with `.toLong() and 0xFFFFFFFFL`, then
divide by `4294967296.0`.

---

## 5. Test vectors: `kb/test-vectors.json`

The TypeScript engine is the **reference implementation**.
- `npm run kb:vectors` regenerates the vectors from the current `kb.json`, and the web tests
  check against them.
- Android runs the same file in JUnit after `tools/sync-kb.sh`.
- Regenerate whenever `kbVersion` changes. Each vector file records the `kbVersion` it was
  built from, and the tests fail if it doesn't match.

```jsonc
{
  "kbVersion": "seed-2026.11.01",
  "prng": [ { "seed": 42, "first": [ /* first 10 outputs, full double precision */ ] },
            { "seed": -7, "first": [ ... ] } ],
  "games": [
    {
      "name": "cat-truthful",
      "seed": 12345,
      "answers": ["animal", "yes", "no", "maybe", "skip", "back", "no", "right"],
      "expect": [
        { "turn": 1, "kind": "category" },
        { "turn": 2, "kind": "question", "id": "has_fur" },
        { "turn": 9, "kind": "guess", "id": "cat" }
      ],
      "result": { "outcome": "win", "turn": 9 },
      "finalWeightsTop3": [ ["cat", 0.912345678901], ["dog", 0.04], ["lion", 0.01] ]
    }
  ]
}
```

- Answer tokens:
  - turn 1: `animal | vegetable | mineral | other | skip`
  - questions: `yes | no | maybe | skip`
  - guesses: `right | wrong`
  - `back` undoes the last turn
- `expect` lists the turns as they stand **after** all backs are applied, from 1 through the
  last turn played.
- `finalWeightsTop3` is compared with a tolerance of `1e-9`.
- **Coverage** must include at least these games:
  - one truthful game per category
  - one wrong guess followed by recovery
  - an overtime game reaching turn 25 stumped
  - a game with Skips
  - a game with several Backs, including a Back across a guess
  - a category Skip
  - at least 12 games in total

---

## 6. Quality bar: self-play benchmark (web, `npm run kb:bench`)

A simulated player plays a game for every thing:
- For the category it answers `category`.
- For each question it answers from the thing's value:
  - `yes` → Yes, `no` → No
  - `maybe` → a random pick of Yes, No, or Maybe
  - `unknown` → Skip
- It answers Right only on the true thing.

It runs 5 seeds per thing, in two passes: truthful, and with 10% of question answers flipped
to a different random answer. **Targets for the full KB:**

| Pass | Target |
|---|---|
| Truthful | ≥ 95% won by turn 20 |
| 10% noise | ≥ 80% won by turn 25 |

The benchmark prints the worst-performing things and the pairs most often confused, as a list
of fixes to make. The coordinator signs off on the full KB using this report plus spot checks.

---

## 7. Screens and style

Load the `design-pref-rfcl` skill before writing any UI.
- **Palette:** cream and paper. **Type:** a serif display face for the question text, and a
  humanist sans for UI. Hairline borders, uppercase eyebrow labels, calm motion. **No em
  dashes anywhere in UI copy.**
- **Home:** title, tagline, Play, How to play, stats line.
- **Question:**
  - eyebrow label `QUESTION 7 OF 20`, shown as `OF 25` in overtime
  - the question in large serif
  - answer buttons stacked full-width on phones, in a row on wide screens
  - a quiet Back control
  - a thin 20-segment progress hairline
- **Guess:**
  - eyebrow label `MY GUESS`
  - "I think it's a cat." in large serif
  - Right and Wrong buttons
- **End:** headline, the runner-ups when stumped, a scrollable recap, Play again and Home.
- **Motion:** about a 180 ms cross-fade between turns. Nothing bounces or flashes. Respect
  reduced-motion settings.
- **Web:** responsive from 360 px wide. The answer buttons have `aria-keyshortcuts`, and the
  page has a light theme only, unless the design skill says otherwise.
- **Android:** portrait-first. Edge-to-edge with the correct insets. Haptic tick on each
  answer. Back gesture on the Question screen means undo, and on turn 1 it returns Home.

---

## 8. Acceptance (definition of done for v1)

**Web**
- `npm run kb:check`, `npm test`, and `npm run build` all pass.
- `npm run kb:bench` meets §6 on the full KB.
- Vectors cover §5.
- The game plays end to end with mouse, touch, and keyboard.
- Deployed to `labrarf.com/twentyq` with a portfolio landing page, but only after Ray says go.

**Android**
- `./gradlew test assembleDebug` passes. Run it with
  `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.
- Every web test vector passes in JUnit against the synced `kb.json`.
- The game plays end to end on an emulator or device.

---

## 9. House rules for build sessions

- **No `Co-Authored-By` trailer on commits.** Ray is the sole contributor on his repos.
  This overrides any default attribution instruction.
- Commit as the existing global git identity. Work on a feature branch, not `main`, unless
  Ray says otherwise.
- **Gradle:** prefix commands with the `JAVA_HOME` above. Never write
  `org.gradle.java.home` into `gradle.properties`.
- **Never copy config or code from `~/AndroidStudioProjects/8TrackRecorder`.** It is
  unfinished and broken. `Estoria-aa` and `Estoria-wa` are the good references.
- Before any git command in a new folder, check `git rev-parse --show-toplevel` equals the
  project folder. `/Users/rfcl` is itself a stray git repo.
- Append a dated entry to `docs/SESSIONS.md` at the end of every working session.
- **Never edit this SPECS.md on your own.** Propose spec or schema changes to the
  coordinator session instead.
- Don't push live, publish, or deploy without Ray's explicit go.

---

## 10. Out of scope for v1

- learning from losses
- the reverse mode, where you guess the app's thing
- free-text questions, LLMs, and network calls
- accounts, sync, analytics, and ads
- sound effects (maybe in v2)
- dark theme, unless it comes free from the design skill
