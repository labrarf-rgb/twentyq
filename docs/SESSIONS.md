# Session Log

Newest first. One dated entry per working session.

## 2026-11-01 · Web build session 4 (spec v4: geometry and fit)
- Committed spec v4 as given, then reworked the layout to §7. The page is a `100dvh` flex column (header, device area, stats and links row, footer); the device takes the leftover height, `D = min(92cqw, 100cqh, 460px)`, so the page cannot scroll. The footer hides under 700 px of height. The recap is in the flow with its own scroll (max `min(14rem, 30dvh)`), and the device shrinks to make room.
- Device geometry follows the §7 table in fractions of D: LCD bezel 0.70 x 0.26 at y 0.22 to 0.48, buttons at the listed centres (0.15 D), UNDO 0.22 x 0.075 at (0.5, 0.84), NEW GAME and SOUND at y 0.775, labels 0.026 D, ridge rings moved outside the 0.44 D safe circle.
- LCD: 0.025 D side padding, a 0.035 D counter strip, line height 1.25 em, exactly 3 lines. The font is the smaller of "24 characters across" and "3 lines fit", using DotGothic16's advance measured at runtime (`src/lib/lcdFont.ts`, 0.5 em today). Words longer than 24 characters are broken.
- Fit check at `/fitcheck.html` (dev only, `src/dev/fitcheck.ts`): 353 unique LCD strings (all questions, category prompts, a guess line per thing incl. the turn-21 lead-in, idle, confirm, thinking, win, and the stumped line with the three longest names) at the six required viewports, plus safe circle, button overlap and page scroll, including with a finished 25-turn recap open. Result: all six sizes PASS. `?break=1` makes it fail, so it can fail.
- Moved "Sound on/off" and the recap toggle into the links row to save height.

## 2026-11-01 · Web build session 3 (spec v3: fixed buttons)
- Committed spec v3 as given. Turn 1 now asks one category at a time ("Is it an animal?" ... "Is it something else?"): YES or SOMETIMES picks the one shown, NO moves on (NO on the last, or UNKNOWN anywhere, sends a category `skip`), UNDO steps back one prompt and from turn 2 returns to the first. The prompt step is UI state only; the engine still gets one category answer, so the engine, KB and vectors are untouched.
- The buttons never change: no relabelling, no `disabled`, no dimming, no lit/unlit SOUND dot. A press with no meaning still animates (keyboard presses too, for UNDO, NEW GAME and SOUND as well) and clicks. SOUND state moved to a quiet "Sound on/off" line below the device.
- Keyboard is only U/N/Y/S, Backspace/Z, G, M (A/V/I/O and 1-4 removed). How to play text updated.
- Played turn 1 every way in the browser (each category by walking NO, NO x4, UNKNOWN first and third, UNDO inside the prompts and from turn 2, non-YES keys in idle) plus two full games to a win. 70 tests, kb:check and build green.

## 2026-10-31 · Web build session 2 (KB review fixes, handheld UI)
- Applied the coordinator's KB review: removed `oak_tree`, `tree.climbs` no, `lives_in_africa` unknown for non-animals (this also changes that one value on the seed non-animals), separated `gold` from `ring`, added the two honest yeses I could find on sparse produce (pineapple peel, coconut can_hold). Did not pad the rest. `kbVersion` `kb-2026.11.01.3`, 212 things, vectors regenerated.
- Built the v2 handheld UI from SPECS §2 and §7: round cream shell with ridge rings, sage DotGothic16 LCD (bundled via @fontsource, so nothing is fetched at runtime) with typewriter text, "I'm thinking..." and paged scrolling past 3 lines, four ink caps with relabelling on turn 1, UNDO, NEW GAME (asks "Start over?"), SOUND, synthesized Web Audio beeps with a persisted mute, light/dark toggle, stats line, How to play sheet and in-place recap below the device.
- Undo from the end screen takes the finished game back out of the stats, so a second end is not double counted.
- Played in the browser: win, wrong guesses, overtime to stumped (paged 4-line ending), undo (also from the end), new game confirm, press-to-finish-typing, keyboard, mute persistence, dark theme, 360 px width.
- Not done: deploy script, portfolio landing page. Audio was checked only by confirming the oscillators fire (not heard). Reduced-motion paths are coded but were not exercised in a browser.

## 2026-10-31 · Web build session 1 (engine, KB tooling, KB expansion)
- Branch `feature/twentyq-web`. Scaffolded Vite + React 19 + TS + Zustand + Tailwind v4 + Vitest (modelled on Estoria-wa, `base: '/twentyq/'` in production).
- Reference engine in `src/engine/` per SPECS §4 (mulberry32, soft scoring, info-gain, 1e-9 tie epsilon, guess rules, Back as replay). Unit tests in `engine.test.ts`.
- `npm run kb:check`, `kb:vectors`, `kb:bench` added under `scripts/`. 16-game `kb/test-vectors.json` committed early for the Android port; hand-over notes in the shared notes folder (`web-vectors-ready.md`).
- KB expanded from 36 to 212 things and from 96 to 128 questions (32 appended, no ids changed or reordered). New-question values were appended to the 36 seed things; their existing values are untouched. `kbVersion` is now `kb-2026.11.01.3` (after coordinator review: oak_tree removed, lives_in_africa unknown for non-animals, gold/ring separated); vectors regenerated.
- Bench: 100% truthful by turn 20, 99.4% with 10% noise by turn 25 (self-play from the KB itself, so it measures consistency, not accuracy). Stopped here for coordinator KB review. Not started: UI, deploy script, portfolio page.

## 2026-10-31 · Coordinator
- Repo created. Shared spec v1 written to `docs/SPECS.md` (identical in both repos).

- Seed `kb/kb.json` (96 questions, 36 things) added. Prototype self-play on the seed: 100% by turn 20 truthful, 99% with 10% noise.
