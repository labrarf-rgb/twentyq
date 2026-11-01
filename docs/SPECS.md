# Twenty Q: Shared Spec

> **This file is identical in both repos.** `TwentyQ-wa` is the web app and `TwentyQ-aa` is
> the Android app. Change it only through the coordinator session, which copies it to both
> repos. Each repo keeps its own dated log in `docs/SESSIONS.md`.

Last spec update: 2026-11-01, v8. History:
- **v8:** the knowledge base grows from 212 to about 1,000 things. The schema and engine are
  unchanged.
- **v7:** each category question (animal, vegetable, mineral) is its own numbered question.
  The engine has a category phase, and `schemaVersion` is 2. **Engine change: the vectors
  must be regenerated and the parity tests re-run.**
- **v6:** the Android device is centred and sized to the phone. The overtime line is its own
  message.
- **v5:** the web device fills the window, up to D = 800 px.
- **v4:** exact device geometry, LCD fit rules, no page scroll, and a required fit check.
- **v3:** the buttons never change.
- **v2:** a handheld toy UI with synthesized beeps.
- **v1:** initial spec.

---

## 1. What it is

Twenty Q is a twenty questions game in the spirit of the 90s handheld toy.
- **You think of something.** The app asks questions and you answer with
  **Unknown / No / Yes / Sometimes**. It tries to guess within 20 questions.
- **The UI is an on-screen handheld toy.** It has a round shell, a backlit dot-matrix LCD,
  chunky buttons, and beeps.
- **One mode only.** The app is always the one guessing.
- **Fully offline.** There is no server, API key, account, analytics, or learning.
- **One knowledge base drives both apps.** It is the shared file `kb.json`, with one shared
  engine algorithm, so the same answers produce the same game on both platforms.

| | Web | Android |
|---|---|---|
| Repo | `~/WebAppProjects/TwentyQ-wa` | `~/AndroidStudioProjects/TwentyQ-aa` |
| Stack | Vite + React 19 + TypeScript + Zustand + Tailwind v4 (tokens as CSS variables + `@theme`), Vitest | Kotlin + Jetpack Compose (Material 3, themed to our tokens), single activity, JUnit |
| IDs | — | `applicationId` / `namespace` `com.labrarf.twentyq`, minSdk 29, targetSdk 36, versionCode = git commit count (copy the `gitCount` approach from `~/AndroidStudioProjects/Estoria-aa/app/build.gradle.kts`) |
| Ships to | `~/Portfolio-Website/twentyq` via `npm run deploy` (labrarf.com/twentyq), source at github.com/labrarf-rgb/twentyq (public). Listed last on the portfolio's `projects.html` and linked directly (no embed page). `public/privacy.html` is served at `/twentyq/privacy.html` and is also the Play privacy policy URL. Vite `base: '/twentyq/'`. | Google Play (internal testing first). Ray signs release bundles in Android Studio with his upload key. No GitHub remote, by Ray's choice. versionName 1.0 shipped as versionCode 19; 1.1 carries the ~1,000-thing KB. |
| KB copy | **Master copy** at `kb/kb.json` | Exact copy at `app/src/main/assets/kb.json` |

**Look:** an original handheld guessing toy, coloured in Ray's papery palette (§7). Load the
`design-pref-rfcl` skill before any UI work: its tokens, page chrome, and copy rules apply.

---

## 2. Game flow (played on the device)

The whole game happens on one screen: the **device** (§7). Every step of the game is a
**turn**, numbered 1 to 25. A turn is either a question or a guess.

### Controls

**Answer buttons**, left to right, in an arc under the LCD. On question turns:

| Button | Engine answer token | Keyboard (web) |
|---|---|---|
| **UNKNOWN** | `skip` | `U` |
| **NO** | `no` | `N` |
| **YES** | `yes` | `Y` |
| **SOMETIMES** | `maybe` | `S` |

**Other controls:**
- **UNDO** sits centred below the arc (keyboard `Backspace` or `Z`). It undoes the last
  turn, whether a question or a guess, back to turn 1.
- **NEW GAME** is a small round button bottom-left (keyboard `G`). Mid-game the LCD first
  asks "Start over?", and YES confirms.
- **SOUND** is a small round button bottom-right (keyboard `M`). It mutes or unmutes and
  remembers the choice.

### Flow

1. **Idle.** The LCD shows *"Think of something. Press YES to start."*
   - YES (or NEW GAME) starts a game.
   - The page outside the device shows a quiet stats line and a "How to play" link that
     opens a sheet. The sheet says:
     - think of an object, animal, or plant
     - answer honestly
     - Sometimes means partly or it depends
     - Unknown means you don't know or it doesn't apply
     - what the four categories mean
2. **The game opens with category questions, and each one is its own numbered question**
   (v7). The buttons stay exactly the same. The LCD asks, in this order, stopping as soon as
   the category is settled:
   - **Q1** *"Is it an animal?"*
   - **Q2** *"Is it a vegetable?"* (only if Q1 wasn't YES)
   - **Q3** *"Is it a mineral?"* (only if Q1 and Q2 weren't YES)

   How each answer works:
   - **YES** settles the category. Normal questions start on the next turn.
   - **NO** or **SOMETIMES** moves on to the next category question.
   - **UNKNOWN** stops asking category questions. Normal questions start on the next turn.
   - After a NO to *"Is it a mineral?"* the category phase ends. There is no
     *"Is it something else?"* question: three NOs already point the engine at "other".
   - Each category question shows its own counter (`Q1`, `Q2`, `Q3`), counts toward the 20,
     and is undone by UNDO like any other turn.
   - Category definitions for the sheet:
     - Animal: any animal, or something mostly made from one (leather, wool, egg).
     - Vegetable: a plant, or something made from plants (fruit, bread, wood, paper, cotton).
     - Mineral: non-living, and not from a plant or animal (metal, stone, glass, plastic).
     - Other: places, weather, ideas, and things that don't fit cleanly.
3. **Question turns.**
   - After each answer, the LCD briefly shows *"I'm thinking..."* with animated dots
     (about 400 ms; skipped under reduced motion).
   - Then it **types out** the next question character by character (about 40 characters a
     second). Any button press during the typing completes the text instantly; it does not
     count as an answer.
   - A small `Q7` counter sits in the LCD's top-right corner.
4. **Guess turns.**
   - The LCD types *"I think it's {article} {name}. Am I right?"*
   - **YES** means Right and **NO** means Wrong. UNKNOWN and SOMETIMES do nothing here
     (they still click, see the button rule below).
   - Wrong removes that thing and play continues.
5. **Overtime, as on the toy.**
   - From turn 20 on, every turn is a guess.
   - If the turn-20 guess is wrong, the LCD shows *"Hmm. Give me five more."* once, and play
     continues through turn 25. That line is its own LCD message, shown for about 1.5 s,
     and then the guess replaces it. Never join the two into one message.
6. **End.** The LCD shows one of these, then *"Press YES to play again."*:
   - App wins: *"I win! Got it in {turn}."*
   - Stumped (wrong at turn 25, or no candidates left): *"You win! You stumped me."*
     followed by *"Were you thinking of {a}, {b}, or {c}?"*, the top 3 runner-ups.
     These are informational only.
   - Below the device, a quiet **"Show the questions"** link opens the recap: every turn's
     question or guess with your answer. On web it expands in place; on Android it opens a
     bottom sheet.

**Stats** are stored locally (web `localStorage`, Android DataStore). Fields: `played`,
`appWins`, `stumped`, and `totalTurnsOnWins`. The page shows a line like
"Played 12 · You stumped me 3 times". A game counts once it reaches the end; abandoning it
with NEW GAME counts nothing.

### LCD text rules
- Up to 3 lines, word-wrapped.
- If a message needs more than 3 lines, it scrolls up a line at a time, about 1.2 s per line.
- The LCD can show lower and upper case. Use sentence case as written above.
- No em dashes in any message.

---

## 3. Knowledge base: `kb.json` (the contract)

Schema version 2. **The web repo owns the master copy (`kb/kb.json`).** Android copies it
byte for byte with `tools/sync-kb.sh`, which copies `kb/kb.json` and
`kb/test-vectors.json` from `../../WebAppProjects/TwentyQ-wa`. Nobody edits the Android copy
by hand. A schema change needs both apps updated together, through the coordinator.

```jsonc
{
  "schemaVersion": 2,                       // v7: engine.category removed
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
- **Size.** It started as a seed of 96 questions and 36 things. It is now `kb-2026.11.02.5`, with
  994 things and 168 questions. The web session expanded it
  to **about 200 things** (v1), and v8 grows it to **about 1,000**:
  - at 1,000: roughly 300 animal, 250 vegetable, 300 mineral, 150 other
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
- invalid JSON or wrong `schemaVersion` (must be 2)
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

**Constants** come from `kb.engine`: `likelihood`, `guessConfidence` (0.80),
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

### Category phase (v7)
The game starts in the category phase. It asks up to three **category questions**, in the
fixed order `animal`, `vegetable`, `mineral`, one per turn starting at turn 1.

**Value of a category question for a thing:** for category question `c` and thing `i`, the
value `cv(i,c)` is:
- `yes` if `category[i] == c`
- `maybe` if `c` is in `altCategories[i]`
- `no` otherwise

**Applying an answer** works exactly like a normal question, using the same `likelihood`
table:
- **yes:** multiply `w[i]` by `L[yes][cv(i,c)]`, normalize, and end the phase.
- **no:** multiply by `L[no][cv(i,c)]` and normalize. Go on to the next category question,
  or end the phase after `mineral`.
- **maybe:** multiply by `L[maybe][cv(i,c)]` and normalize. Go on to the next category
  question, or end the phase after `mineral`.
- **skip:** no weight change, and end the phase.

**Rules:**
- Category turns never guess and never draw from the RNG.
- Normal question selection (below) starts on the turn after the phase ends.
- The `engine.category` constants block is **removed** from `kb.json`, so `schemaVersion`
  goes to **2**.

### Deciding what turn `t` is (after the category phase)
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
  `k == 1`, and never on guess turns or category turns.

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
      "answers": ["yes", "yes", "no", "maybe", "skip", "back", "no", "right"],
      "expect": [
        { "turn": 1, "kind": "category", "id": "animal" },
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
  - category turns: `yes | no | maybe | skip`, the same as questions
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
  - a category settled at Q1, one at Q2, one at Q3, three NOs (other), a SOMETIMES on a
    category question, and an UNKNOWN on a category question
  - at least 12 games in total

---

## 6. Quality bar: self-play benchmark (web, `npm run kb:bench`)

A simulated player plays a game for every thing:
- For each category question it answers from `cv` (yes, then no, then the random pick for
  maybe, the same as questions).
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
of fixes to make. `npm run kb:bench:fast` (every 5th thing, 2 seeds) is for quick checks between
batches. The full `kb:bench` is the sign-off. `npm run kb:format` rewrites `kb.json` in the
compact one-thing-per-line layout.

Latest full bench (`kb-2026.11.02.5`): 98.6% truthful by turn 20, 92.7% with noise by turn 25,
and an average win at turn 14. The coordinator signs off on the full KB using this report plus spot checks.

---

## 7. The device: look, sound, feel

This is an **original handheld guessing toy**, inspired by the 90s toys in feel. It must
**not** copy any real product's logo, name, mascot, or exact shape. The face carries our
own wordmark, "Twenty Q", in Spectral (light weight) where a toy would have a logo.

### Shape and geometry (v4: hard layout rules, same on both platforms)

All positions are fractions of the shell diameter **D**, measured from the top-left corner
of the shell's bounding square, so `(0.5, 0.5)` is the centre. Both apps use these numbers.

**Safe circle.** Every control, label, the LCD bezel, and the wordmark must sit **entirely
inside a circle of radius 0.44 D** around the centre. Nothing may touch or cross the rim or
the ridge rings.

| Element | Size | Centre / position |
|---|---|---|
| Wordmark "Twenty Q" | font size 0.065 D | centred, baseline at y 0.165 |
| LCD bezel | 0.70 D × 0.26 D, corner radius 0.035 D, bezel padding 0.015 D | x 0.15 to 0.85, y 0.22 to 0.48 |
| UNKNOWN, SOMETIMES buttons | Ø 0.15 D | (0.215, 0.62), (0.785, 0.62) |
| NO, YES buttons | Ø 0.15 D | (0.405, 0.66), (0.595, 0.66) |
| Answer labels | font 0.026 D, letter-spacing 0.1 em, no curve required | centred over each button, baseline 0.02 D above the button's top edge |
| NEW GAME, SOUND buttons | Ø 0.065 D | (0.30, 0.775), (0.70, 0.775) |
| NEW GAME, SOUND labels | font 0.022 D | centred under each button, top 0.012 D below it |
| UNDO oval | 0.22 D × 0.075 D | centred at (0.5, 0.84), label font 0.026 D |

**Shell size.**
- **Web (v5: as big as the window allows):** the page is a full-height column (`100dvh`).
  - **Header:** a single slim row, at most 48 px tall.
  - **Device:** fills everything else, with 16 px breathing room above and below.
    `D = min(94vw, 100dvh − header − below-row − 32px, 800px)`, where `below-row` is 0 on
    wide screens.
  - **Wide screens (600 px and wider):** the stats line, the sound state and How to play move
    into the header row, on the right next to the theme toggle. Nothing sits under the device.
  - **Narrow screens (under 600 px):** the header holds only the wordmark and the theme
    toggle. The stats line and How to play sit in one compact row under the device, at most
    48 px tall.
  - **Footer note** ("Everything runs on this page..."): it moves to the bottom of the How to
    play sheet. There is no page footer.
  - **The page never scrolls, horizontally or vertically, at any viewport from 320 × 560 up.**
    The recap and how-to sheets are the only things that may scroll, inside themselves.
  - Expected sizes: 1024×768 gives D ≈ 690, 1440×900 gives D = 800, 375×667 gives D ≈ 352
    (width-limited).
- **Android (v6: centred, as big as the phone allows):**
  - **Layout:** a full-screen column inside the safe-drawing insets. Nothing may sit under
    the status bar, the camera cutout, or the gesture/navigation bar.
    - **Top row:** the stats line, centred, at most 40 dp tall.
    - **Middle:** the device.
    - **Bottom row:** How to play and Show the questions, centred as a pair, at most 48 dp tall.
  - **Size:** `D = min(screen width − 24 dp, middle height − 24 dp, 560 dp)`. On a typical
    phone this means the full width less a 12 dp margin each side (D ≈ 387 dp on the
    1080×2400 AVD).
  - **Centring:** the device is centred horizontally on the screen and vertically in the
    middle area, both to within 1 dp. No fixed-size containers, start-aligned Boxes or
    hard-coded offsets.

### LCD text fit
- **Inside the LCD:** padding of 0.025 D on the left and right.
- **Counter strip:** the top 0.035 D of the LCD is reserved for the `Q7` counter at the
  right. Text starts below it, so the two never overlap.
- **Font size:** the smaller of two sizes: the size at which exactly 24 characters of
  DotGothic16 fill one line (measure the font's real advance width, don't assume it), and the
  size at which 3 lines at 1.25 em fit under the counter strip.
- **Lines:** line height 1.25 em, and exactly 3 lines visible.
- **Wrapping:** only at spaces, with no horizontal clipping ever. If a single word could ever
  exceed a line (none do today), break it, and never let it overflow.
- **Longer messages** (runner-ups, for example) scroll up one line at a time per §2. They are
  never clipped and never shrink the font.

### Fit check (required, both apps)
Each app gets an automated check that renders **every string the LCD can show** into the
real LCD at real size, and asserts it fits per the rules above. "Every string" means:
- every question in `kb.json`
- the four category prompts
- the guess line for every thing in `kb.json`
- every idle, overtime, win, stumped, confirm and "Press YES" message
- the longest possible runner-up message: the three longest names

It also asserts the safe circle and the page rules at these sizes:
- **Web:** 320×560, 375×667, 390×844, 768×1024, 1280×620, 1440×900. Run it in the dev
  server, as a dev-only route or a script driving the browser. It must report pass or fail
  per size.
- **Android:** a 360×640 dp phone and the `TwentyQ_Test` AVD (1080×2400). Run it as an
  instrumented Compose test. It also asserts the v6 centring (horizontal and vertical, within
  1 dp) and that nothing overlaps the system bars.

### Colour (Estoria palette from `design-pref-rfcl`; warm, never saturated)
- **Page:** `--bg`.
- **Shell:** warm cream plastic.
  - A very soft radial shade from `--card` (top-left highlight) to `--panel`.
  - Warm-tinted soft shadow from `--shadow`. No glossy highlights, chrome, or neon.
- **Buttons:**
  - Ink (`--ink`) rubber caps with a faint moulded inner ring, and a 1 px lighter top edge
    for the pressed-in feel.
  - **Pressed:** move down 1 to 2 px, shadow shrinks, dim slightly. 80 ms, no bounce.
  - **Buttons never change.** No relabelling, dimming, hiding, or recolouring, ever, in any
    state. A press that has no meaning in the current state still plays the press animation
    and click, and changes nothing else. All guidance lives on the LCD, just like the toy.
- **LCD backlight:** soft sage built from the accent hue, about `oklch(0.87 0.045 150)`.
  - Text is dark ink-green, about `oklch(0.30 0.035 150)`.
  - A barely visible ghost dot grid of unlit pixels behind the text.
- **Dark theme**, via a manual toggle on web (persisted; follow the system theme on
  Android):
  - The shell becomes warm graphite (`--card` / `--panel` dark values) and button caps
    become `#4c4740`.
  - The LCD keeps the same sage glow, so it reads as backlit.
  - Labels use the dark `--soft`.
  - Contrast must pass in both themes.

### Type
- **LCD:** a dot-matrix font, **DotGothic16** (OFL), bundled with the app and never fetched
  at runtime.
- **Page chrome** (stats line, how-to sheet, recap): Spectral + Hanken Grotesk, per the
  design skill. Eyebrow labels as the skill defines them.
- **Copy:** no em dashes anywhere, and the plain, low-hype voice of the skill.

### Sound (synthesized, no audio files)
Square-wave blips, generated at runtime: Web Audio on web, `AudioTrack` PCM on Android.
Volume stays modest.

| Event | Sound |
|---|---|
| Any button press | 25 ms blip, about 880 Hz |
| New question appears | two-note chirp, about 660 then 990 Hz, 60 ms each |
| Guess appears | rising three-note arpeggio |
| App wins | short five-note major jingle, under 1 s |
| Stumped | falling three-note "wah wah", under 1 s |
| Wrong guess | low 120 ms buzz, about 180 Hz |

- SOUND toggles all of it, **default on**, and the setting persists.
- Web: create the AudioContext on the first user gesture.
- Android: also respect the system media volume.

### Feel
- **Haptics on Android:** a light tick on every press, and a heavier one on win or stumped.
- **Motion:** the typed-out LCD text and the "I'm thinking..." dots are the only animation,
  plus the button press.
- **Reduced motion:** show the text instantly and skip the thinking dots.
- **Accessibility:**
  - Every button has a real accessible label ("Yes", "Sometimes", "Undo", etc.) and visible
    focus rings (accent green).
  - The LCD text is an `aria-live="polite"` region on web, and a live region on Android.
- **Web:** `aria-keyshortcuts` on the buttons. Responsive from 360 px. The device never
  scrolls off-screen on a phone in portrait.
- **Android:** portrait-locked. Edge-to-edge with the correct insets. The device is drawn in
  Compose (shapes and Canvas), not as a bitmap. The system Back gesture means UNDO during a
  game, and leaves the app when idle.

---

## 8. Acceptance (definition of done for v1)

**Web**
- `npm run kb:check`, `npm test`, and `npm run build` all pass.
- `npm run kb:bench` meets §6 on the full KB.
- Vectors cover §5.
- The game plays end to end with mouse, touch, and keyboard.
- The fit check (§7) passes at every listed size.
- Deployed to `labrarf.com/twentyq` with a portfolio landing page, but only after Ray says go.

**Android**
- `./gradlew test assembleDebug` passes. Run it with
  `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.
- Every web test vector passes in JUnit against the synced `kb.json`.
- The game plays end to end on an emulator or device.
- The fit check (§7) passes on both devices.

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
