# Android port of v10 (guessing fixes)

For the Android session at `~/AndroidStudioProjects/TwentyQ-aa`. Written 2026-11-15 by the web
session that built v10 (branch `claude/v10-guessing-84dd0e`). SPECS.md is the contract; this note
lists exactly what to port. Nothing in it is done on Android yet.

## What v10 is

Three fixes from the 2026-11-14 guess review, approved by Ray:
1. a new `likelihood` table (data only)
2. two KB class rules applied to `kb.json`: worldwide things are `unknown` on the continents,
   people are `maybe` on climbs, jumps and groups (data only)
3. an **endgame lookahead** from turn 12 (engine)

The UI, the buttons, the schema (`schemaVersion` 2), the game log format, learning, `near`, the
RNG, the gain loop and the category phase are all unchanged.

## 1. Engine code to port (the only code change)

Reference: `src/engine/engine.ts` in the web repo, functions `decide`, `endgameQuestion`, `topSum`.
Exact rules: SPECS §4 "Deciding what turn `t` is" and "Endgame lookahead (v10)", and
`docs/VECTORS.md` §4 (the line-by-line choices).

- **`EngineConfig`** (`engine/Kb.kt`) gains two optional fields:
  `val endgameFrom: Int? = null` and `val endgameOvertime: Double = 0.0`.
  Absent `endgameFrom` must mean "off", exactly v9.
- **`Game.decide(t)`** (`engine/Game.kt`), in this order:
  1. `t >= forceGuessTurn` → guess `top` (as now)
  2. `t >= guessMinTurn && w[top] >= guessConfidence` → guess `top` (as now)
  3. every question asked → guess `top`. Today this is folded into `chooseQuestion() ?: guess`;
     it must now be checked **before** the endgame, explicitly.
  4. **new:** `endgameFrom != null && t >= endgameFrom` → `endgameQuestion(forceGuessTurn - t + 1)`;
     `-1` → guess `top`, otherwise ask that question (add it to `asked`). **No RNG draw.**
  5. otherwise `chooseQuestion()` by gain, as now (one RNG draw).
- **`endgameQuestion(r)`** and **`topSum(u, m, extra, lambda, best)`**: port from the web code. Only
  `+` and `*` on `Double`; no `log`, no `FdLibm`, no `Math.fma`. Sum the kept top values largest
  first, the `extra` (overtime) values separately, then `s += lambda * t`. Sum the three answers'
  values in the order yes, maybe, no. Scan questions in index order from "guess now", replacing
  the best only when `v > bestV + 1e-9` (so ties go to guessing, then to the lower index).
- **`P`** is the learned answer probability (§11.2) you already compile; the endgame reads the same
  `P` the gain loop reads. Guessed things have `w = 0` and need no special case.
- **Cost:** `Q * 3 * N` multiplies per endgame turn (182 * 3 * 1343, about 733k), cheaper than a gain
  turn. On the web a full replay to turn 19 takes 50 ms with the endgame against 68 ms without, so
  Back gets faster, not slower. Reuse the scratch arrays if a profile says so.
- **Do not port** anything else from the review branch. The prototypes `categoryQuestions`,
  `commonBoost`, `softReliability`, `guessRatio`, `Question.soft` and `Thing.common` were taken out
  of the web engine before v10 and never shipped.

## 2. Constants (all in `kb.engine`, read from `kb.json`, never hard-coded)

| constant | v9 | v10 |
|---|---|---|
| `likelihood.yes` (yes / maybe / no / unknown KB value) | 0.85 / 0.40 / 0.05 / 1/3 | **0.82 / 0.30 / 0.03 / 1/3** |
| `likelihood.maybe` | 0.10 / 0.30 / 0.10 / 1/3 | **0.10 / 0.30 / 0.07 / 1/3** |
| `likelihood.no` | 0.05 / 0.30 / 0.85 / 1/3 | **0.08 / 0.40 / 0.90 / 1/3** |
| `endgameFrom` | absent | **12** |
| `endgameOvertime` | absent | **0.5** |
| `guessConfidence`, `guessMinTurn`, `forceGuessTurn`, `maxTurns`, `topK`, `learnPriorStrength` | 0.3, 6, 20, 25, 2, 2 | unchanged |

`TIE_EPSILON` stays `1e-9` and is now used by the endgame scan too.

## 3. Data to sync

`tools/sync-kb.sh` copies both files from the web repo once v10 is merged to main there:
- `kb/kb.json`, **`kb-2026.11.15.1`** (1,343 things, 182 questions)
- `kb/test-vectors.json`, built from `kb-2026.11.15.1`: 26 games, including 7 `learned-*` games.
  Endgame questions appear in 9 games, endgame guesses (made while `w[top] < guessConfidence`)
  in `bread-with-skips` and `learned-name-matches-a-kb-thing`, and questions after a wrong guess in 7.

**Sync both files in the same change as the engine port, never before it.** `Kb.kt` parses with
`ignoreUnknownKeys = true`, so an Android 1.2 build reading the v10 `kb.json` would load without
error, ignore `endgameFrom`, and play the new table without the endgame: a mix that was never
tested, and the parity vectors would fail.

## 4. Spec and docs to copy

- `docs/SPECS.md`: the whole file (it is identical in both repos). The v10 changes are the header
  and history, §3 (two class rules, two validator warnings), §4 (constants, the decision order,
  "Endgame lookahead (v10)", and the Pick sentence: no RNG on endgame turns), §5 (endgame
  coverage), §6 (sheet-like pass), §11.2 (the 0.03 to 0.35 example), §11.4, §11.5 (the table), and
  §12 (v10 summary and order of work). §3's validator, §6 and §11.5 are web-only tools; Android
  only reads them.
- `docs/VECTORS.md` §4 if Android keeps a copy of the port notes.

## 5. Done when

- every vector in `kb/test-vectors.json` passes in JUnit (weights to 1e-9), the learned ones included
- a unit test or two for the endgame: off when `endgameFrom` is absent; endgame turns give the same
  game for any seed after the last gain-chosen question; a flat KB guesses at `endgameFrom`
  (the web tests in `src/engine/engine.test.ts`, "endgame lookahead", are the model)
- the device UI is untouched (no fit check needed: no string or geometry changed)
- `docs/SESSIONS.md` entry, then the Android release on Ray's go
