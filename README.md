# Wild Guess

A daily species ID game. Each mode (currently **Birds** and **Fish**) has one quiz per day: everyone gets the same ten rounds, one try each, and a leaderboard that starts fresh at **4am Eastern**. Each round names a species; pick its photo out of four. Later rounds are lookalikes from the same family, and faster answers and later rounds score more (max 5,500). Unlimited **practice** runs are random and never reach the leaderboard. Finished daily runs can be shared as a short text with a row of green and red squares.

## How it's built

- `index.html` — the whole game (no build step). Daily progress is kept in the browser so a reload resumes; leaving mid-round counts that round as a miss.
- `data/birds.json`, `data/fish.json` — species lists. Each entry: `name`, `sci`, `family` (lookalike group), `tier` (1 easy – 3 hard), and `ph` (iNaturalist open-data photo ids with photographer, license, and an optional crop like `b18` that trims a caption off one edge).
- `api/daily.js` — `GET /api/daily?mode=` returns today's quiz; `POST /api/daily {mode}` starts today's run and sets a once-per-day cookie (`wg_<mode>`). The quiz is generated from a seed of the day and mode, and the first request of the day saves it to Blob (`daily/<mode>/<day>.json`) so data edits can't change a quiz in progress. No scheduled job is needed.
- `api/scores.js` — `GET /api/scores?mode=` returns today's top 10; `POST /api/scores {mode, day, name, score, hits}` only accepts a run whose cookie shows it was started today and not yet posted. Runs are stored as `runs/<mode>/<day>/…`, so each day's board starts empty with nothing to delete.
- `api/_lib.js` — shared day clock (4am Eastern rollover), cookie helpers, and the seeded quiz builder.
- Scores and saved quizzes live in a **private Vercel Blob store**.

One play per day is enforced by a cookie, so a new browser or incognito window gets another try. That's a deliberate trade-off for not needing logins.

## Deploying

Pushes to `main` deploy automatically. The project needs a Blob store (private access) connected to it, which supplies `BLOB_STORE_ID`.
