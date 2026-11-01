# Session Log

Newest first. One dated entry per working session.

## 2026-11-01 · Web build session 7 (shipped)
- Ship prep committed (`11dcd07`): `scripts/deploy.sh` (Estoria's script adapted: clean-tree check, lock, settle wait, keep recent assets, live SHA poll; `npm run deploy`), `dist/version.json`, PWA manifest and icons (`art/icon-source.svg`, `scripts/make-icons.sh`), and `public/privacy.html` (web and Android, dated 2026-11-01, linked from How to play).
- With Ray's go: created https://github.com/labrarf-rgb/twentyq (public), pushed `main`, ran `npm run deploy`. Live at https://www.labrarf.com/twentyq/ (privacy at /twentyq/privacy.html).
- **Bug found live and fixed:** the first deploy pruned the bundled fonts, because the deploy script only kept assets named in `index.html` and the fonts are named inside the CSS, so the LCD fell back to a system monospace. `deploy.sh` now keeps and verifies assets referenced from kept stylesheets (`708c791`), and a second deploy (with `FORCE=1`, safe because `index.html` and the CSS were unchanged) restored them. Local `vite preview` had not caught it because it serves `dist/` directly.
- Portfolio: `twentyq.html` case study, a last `.project-list-item` on `projects.html` (after Poem Type, at Ray's request), SITE-GUIDE registry and log. Linked direct to `/twentyq/` with no `twentyq-app.html` wrapper, per the guide's rule (manifest plus `localStorage`). Not featured on `index.html`.
- Verified live: the app plays a full game including overtime and a win, undo works, the dot matrix font loads, the page does not scroll, privacy page loads, projects.html lists Twenty Q last, and the case study's Open app links point at `/twentyq/`.

## 2026-11-01 · Web build session 6 (spec v7: counted category questions)
- Committed spec v7 as given. Engine change in the reference: a category phase of up to three counted questions (animal, vegetable, mineral), one per turn from turn 1. YES settles and ends the phase, NO or SOMETIMES goes on (after mineral the phase ends), UNKNOWN ends it. Scored with the normal likelihood table and `cv(i,c)` (yes if the category matches, maybe if in altCategories, else no). No guessing and no RNG draw on category turns. The "something else?" prompt is gone.
- `engine.category` removed from `kb.json`, `schemaVersion` 2 (kb:check enforces it and rejects the old block), `kbVersion` `kb-2026.11.01.4`. Category turns carry `cat` (0 to 2) in the engine's current-turn type; recap and vector entries use the category id.
- Vectors regenerated (19 games) with category tokens yes/no/maybe/skip and `{turn, kind:"category", id}` expect entries. New coverage: settled at Q1, Q2, Q3; three NOs (rain); SOMETIMES on mineral (sun) and on Q2 and Q3 (house); UNKNOWN on Q2 (potato); Backs across category turns (car). The generator asserts the coverage.
- Bench simulated player answers category questions from `cv` (noise flips them too). Truthful 99.7% by turn 20 (avg win turn 10.9), 10% noise 99.3% by turn 25. No KB content changes needed.
- UI: the store no longer has a prompt step. Category questions answer and undo like any turn and show their own counter (Q1, Q2, Q3). How to play text updated. Fit check updated (three category prompts) and passes at all seven sizes.
- Played in the browser: NO, SOMETIMES, YES at each of Q1 to Q3, UNKNOWN, UNDO across category turns, and full games (rain, sun, bread, dolphin).

## 2026-11-01 · Web build session 5 (spec v5: device fills the window)
- Committed spec v5 as given. `D = min(94vw, 100dvh - header - below-row - 32px, 800px)`: the 460 px cap and the footer are gone (the "Everything runs on this page..." note is now at the bottom of the How to play sheet).
- Header is one 48 px row. At 600 px and wider the stats line, sound state, How to play and Show the questions sit in it, right-aligned next to the theme toggle. Under 600 px the header keeps only the wordmark and the toggle, and the same info block is a fixed 48 px row under the device (two compact lines).
- The recap is now an overlay panel (top right on wide screens, above the info row on narrow ones) that scrolls inside itself, so opening it never changes D.
- Fit check gained 1024x768, an expected-D assertion per size, header and info-row height limits, info-block clipping, and the recap panel staying inside the viewport. All seven sizes PASS. D: 320x560 300.8, 375x667 352.5, 390x844 366.6, 768x1024 721.9, 1024x768 688, 1280x620 540, 1440x900 800.
- Looked at D = 800 (1440x900) and 375x667 with the recap open; LCD, labels and press states scale cleanly.
- Spec v6 (web part): the overtime line was already its own LCD message that the guess replaces, never joined; its hold is now 1.5 s after it finishes typing (was 1.1 s). Covered by a test.

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
