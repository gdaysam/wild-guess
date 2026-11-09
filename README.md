# Four Wings

A 10-round bird ID game. Each round names a species; pick its photo out of four. 658 species from every continent; later rounds are lookalikes from the same family. Faster answers and later rounds score more (max 5,500).

## How it's built

- `index.html` — the whole game (no build step). Photos load from iNaturalist's open-data bucket; each reveal credits the photographer and license.
- `api/scores.js` — Vercel Function. `GET /api/scores` returns the top 10 players (best run per name); `POST /api/scores` with `{name, score, hits}` saves a run.
- Scores live in a **private Vercel Blob store**. Each run is one blob, with the record encoded in its pathname, so posts never collide and reading the board is one `list()` call.

## Deploying

1. Import this repo into Vercel (framework preset: **Other**, no build command).
2. In the project's **Storage** tab, create a **Blob** store with **Private** access and connect it to the project. That adds `BLOB_READ_WRITE_TOKEN`.
3. Redeploy so the function picks up the token.
