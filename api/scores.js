import { put, list } from "@vercel/blob";

// Each finished run is one private blob whose pathname carries the whole record:
//   runs/<score>_<timestamp>_<hits>_<rand>_<base64url name>.json
// so reading the board is a single list() call and concurrent posts never collide.
const MAX_SCORE = 5500;      // 10 rounds, max 100 x round number each
const MAX_PER_HIT = 1000;    // no single round is worth more than 1,000

const cleanName = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);

function parse(pathname) {
  const m = /^runs\/(\d+)_(\d+)_(\d+)_[a-z0-9]+_([A-Za-z0-9_-]+)\.json$/.exec(pathname);
  if (!m) return null;
  const name = Buffer.from(m[4], "base64url").toString("utf8");
  return { name, score: Number(m[1]), at: Number(m[2]), hits: Number(m[3]) };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const runs = [];
      let cursor;
      do {
        const page = await list({ prefix: "runs/", cursor, limit: 1000 });
        for (const b of page.blobs) {
          const r = parse(b.pathname);
          if (r) runs.push(r);
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor && runs.length < 50000);

      runs.sort((a, b) => b.score - a.score || a.at - b.at);
      const seen = new Set();
      const top = [];
      for (const r of runs) {
        const key = r.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        top.push({ name: r.name, score: r.score, hits: r.hits });
        if (top.length === 10) break;
      }
      return res.status(200).json({ top, totalRuns: runs.length });
    }

    if (req.method === "POST") {
      let body;
      try { body = await readBody(req); } catch { return res.status(400).json({ error: "That request wasn't valid." }); }
      const name = cleanName(body.name);
      const score = Number(body.score);
      const hits = Number(body.hits);
      if (!name) return res.status(400).json({ error: "Enter a name using letters or numbers." });
      if (!Number.isInteger(score) || !Number.isInteger(hits) || score < 0 || score > MAX_SCORE ||
          hits < 0 || hits > 10 || score > hits * MAX_PER_HIT) {
        return res.status(400).json({ error: "That score isn't possible in this game." });
      }
      const at = Date.now();
      const id = Math.random().toString(36).slice(2, 8);
      const pathname = `runs/${score}_${at}_${hits}_${id}_${Buffer.from(name).toString("base64url")}.json`;
      await put(pathname, JSON.stringify({ name, score, hits, at }), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
      });
      return res.status(201).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error("scores error", err);
    return res.status(500).json({ error: "Scores are unavailable right now. Try again in a minute." });
  }
}
