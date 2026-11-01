# Session Log

Newest first. One dated entry per working session.

## 2026-10-31 · Web build session 1 (engine, KB tooling, KB expansion)
- Branch `feature/twentyq-web`. Scaffolded Vite + React 19 + TS + Zustand + Tailwind v4 + Vitest (modelled on Estoria-wa, `base: '/twentyq/'` in production).
- Reference engine in `src/engine/` per SPECS §4 (mulberry32, soft scoring, info-gain, 1e-9 tie epsilon, guess rules, Back as replay). Unit tests in `engine.test.ts`.
- `npm run kb:check`, `kb:vectors`, `kb:bench` added under `scripts/`. 16-game `kb/test-vectors.json` committed early for the Android port; hand-over notes in the shared notes folder (`web-vectors-ready.md`).
- KB expanded from 36 to 213 things and from 96 to 128 questions (32 appended, no ids changed or reordered). New-question values were appended to the 36 seed things; their existing values are untouched. `kbVersion` is now `kb-2026.11.01.2`; vectors regenerated.
- Bench: 100% truthful by turn 20, 99.4% with 10% noise by turn 25 (self-play from the KB itself, so it measures consistency, not accuracy). Stopped here for coordinator KB review. Not started: UI, deploy script, portfolio page.

## 2026-10-31 · Coordinator
- Repo created. Shared spec v1 written to `docs/SPECS.md` (identical in both repos).

- Seed `kb/kb.json` (96 questions, 36 things) added. Prototype self-play on the seed: 100% by turn 20 truthful, 99% with 10% noise.
