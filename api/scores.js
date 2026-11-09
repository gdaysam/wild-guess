import { put, list } from "@vercel/blob";
import { dayKey, previousDayKey, dailyStatus, setDailyCookie, readBody, modeFrom } from "./_lib.js";

// Daily leaderboard. Each posted run is one private blob whose pathname carries the whole record:
//   runs/<mode>/<day>/<score>_<timestamp>_<hits>_<rand>_<base64url name>.json
// The board reads only today's folder, so it starts empty at each 4am Eastern rollover with nothing to delete.
// Practice runs are never posted.
const MAX_SCORE = 5500;      // 10 rounds, max 100 x round number each
const MAX_PER_HIT = 1000;    // no single round is worth more than 1,000

const cleanName = (s) =>
  String(s ?? "").normalize("NFKC").replace(/[^\p{L}\p{N} ._'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);

function parse(pathname) {
  const m = /\/(\d+)_(\d+)_(\d+)_[a-z0-9]+_([A-Za-z0-9_-]+)\.json$/.exec(pathname);
  if (!m) return null;
  return { name: Buffer.from(m[4], "base64url").toString("utf8"), score: Number(m[1]), at: Number(m[2]), hits: Number(m[3]) };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams;
      const mode = modeFrom(q.get("mode") || "birds");
      if (!mode) return res.status(400).json({ error: "Unknown game mode." });
      const day = dayKey();
      const runs = [];
      let cursor;
      do {
        const page = await list({ prefix: `runs/${mode}/${day}/`, cursor, limit: 1000 });
        for (const b of page.blobs) { const r = parse(b.pathname); if (r) runs.push(r); }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor && runs.length < 50000);
      runs.sort((a, b) => b.score - a.score || a.at - b.at);
      const seen = new Set(), top = [];
      for (const r of runs) {
        const key = r.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        top.push({ name: r.name, score: r.score, hits: r.hits });
        if (top.length === 10) break;
      }
      return res.status(200).json({ day, top, totalRuns: runs.length });
    }

    if (req.method === "POST") {
      let body;
      try { body = await readBody(req); } catch { return res.status(400).json({ error: "That request wasn't valid." }); }
      const mode = modeFrom(body.mode);
      if (!mode) return res.status(400).json({ error: "Unknown game mode." });
      const day = String(body.day || "");
      if (day !== dayKey() && day !== previousDayKey()) return res.status(400).json({ error: "That quiz has ended, so its score can't be posted." });
      const status = dailyStatus(req, mode, day);
      if (status === "posted") return res.status(409).json({ error: "You've already posted today's score." });
      if (status !== "started") return res.status(403).json({ error: "Only a run started from today's quiz can be posted." });
      const name = cleanName(body.name);
      const score = Number(body.score), hits = Number(body.hits);
      if (!name) return res.status(400).json({ error: "Enter a name using letters or numbers." });
      if (!Number.isInteger(score) || !Number.isInteger(hits) || score < 0 || score > MAX_SCORE ||
          hits < 0 || hits > 10 || score > hits * MAX_PER_HIT) {
        return res.status(400).json({ error: "That score isn't possible in this game." });
      }
      const at = Date.now(), id = Math.random().toString(36).slice(2, 8);
      await put(`runs/${mode}/${day}/${score}_${at}_${hits}_${id}_${Buffer.from(name).toString("base64url")}.json`,
        JSON.stringify({ name, score, hits, at }), { access: "private", contentType: "application/json", addRandomSuffix: false });
      setDailyCookie(res, mode, day, "posted");
      return res.status(201).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error("scores error", err);
    return res.status(500).json({ error: "Scores are unavailable right now. Try again in a minute." });
  }
}
