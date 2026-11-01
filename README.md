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

`kb/kb.json` is the master copy. Android copies it with its own `tools/sync-kb.sh`.
