# Twenty Q (web)

A twenty questions game on an on-screen handheld toy. The app guesses what you are thinking of
from a shared, fully offline knowledge base. Spec: `docs/SPECS.md`. Android sibling: `TwentyQ-aa`.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine, vectors, validator, device flow
npm run build        # typecheck + production build (base /twentyq/)
npm run kb:check     # validate kb/kb.json (SPECS section 3)
npm run kb:vectors   # regenerate kb/test-vectors.json after any kb change
npm run kb:bench     # self-play benchmark (SPECS section 6)
```

**Fit check** (SPECS section 7, dev only): with `npm run dev` running, open
http://localhost:5173/fitcheck.html. It loads the real app at 320x560, 375x667, 390x844, 768x1024,
1024x768, 1280x620 and 1440x900, pushes every LCD string into the real LCD, and reports PASS or FAIL per
size (LCD fit, safe circle, no page scroll). `?sizes=500x400` tries other viewports and `?break=1`
injects an oversized font to show the check can fail. The page is not part of the production build.


`kb/kb.json` is the master copy. Android copies it with its own `tools/sync-kb.sh`.
