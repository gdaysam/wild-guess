# Wild Guess

A 10-round species ID game. Each animal group is a mode (currently **Birds** and **Fish**). Each round names a species; pick its photo out of four. Later rounds are lookalikes from the same family. Faster answers and later rounds score more (max 5,500). Each mode has its own leaderboard.

## How it's built

- `index.html` — the whole game (no build step).
- `data/birds.json`, `data/fish.json` — species lists, loaded when a mode starts. Each entry: `name`, `sci`, `family` (lookalike group), `tier` (1 easy – 3 hard), and `ph` (iNaturalist open-data photo ids with photographer and license). Photos load straight from iNaturalist's open-data bucket and every reveal credits the photographer.
- `api/scores.js` — Vercel Function. `GET /api/scores?mode=birds|fish` returns that mode's top 10 players (best run per name); `POST /api/scores` with `{mode, name, score, hits}` saves a run.
- Scores live in a **private Vercel Blob store**. Each run is one blob under `runs/<mode>/`, with the record encoded in its pathname, so posts never collide and reading a board is one `list()` call. Bird runs saved before modes existed sit directly under `runs/` and still count for Birds.

## Deploying

Pushes to `main` deploy automatically. The project needs a Blob store (private access) connected to it, which supplies `BLOB_STORE_ID`.
