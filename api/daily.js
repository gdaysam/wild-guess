import { get, put } from "@vercel/blob";
import { dayKey, msUntilNextDay, dailyStatus, setDailyCookie, buildDailyQuiz, readBody, modeFrom } from "./_lib.js";

// GET  /api/daily?mode=birds  -> today's quiz, the day key, time until the next one, and whether this browser has played
// POST /api/daily {mode}      -> start today's run; sets the once-per-day cookie, refuses a second start
//
// The first request of the day saves the generated quiz to Blob (daily/<mode>/<day>.json) and every later
// request serves that saved copy, so editing species data mid-day can't change a quiz people are already playing.

async function todaysQuiz(mode, day) {
  const pathname = `daily/${mode}/${day}.json`;
  const saved = await get(pathname, { access: "private", useCache: false }).catch(() => null);
  if (saved && saved.statusCode === 200) return JSON.parse(await new Response(saved.stream).text());
  const quiz = buildDailyQuiz(mode, day);
  try {
    await put(pathname, JSON.stringify(quiz), { access: "private", contentType: "application/json", addRandomSuffix: false });
  } catch (err) {
    // Two first-of-the-day requests can race; the other one saved the same seeded quiz, so read it back.
    const again = await get(pathname, { access: "private", useCache: false }).catch(() => null);
    if (again && again.statusCode === 200) return JSON.parse(await new Response(again.stream).text());
    console.error("could not save daily quiz", err);
  }
  return quiz;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const day = dayKey();
    if (req.method === "GET") {
      const mode = modeFrom(new URL(req.url, "http://x").searchParams.get("mode"));
      if (!mode) return res.status(400).json({ error: "Unknown game mode." });
      const quiz = await todaysQuiz(mode, day);
      return res.status(200).json({ day, msLeft: msUntilNextDay(), status: dailyStatus(req, mode, day), quiz });
    }
    if (req.method === "POST") {
      let body;
      try { body = await readBody(req); } catch { return res.status(400).json({ error: "That request wasn't valid." }); }
      const mode = modeFrom(body.mode);
      if (!mode) return res.status(400).json({ error: "Unknown game mode." });
      const status = dailyStatus(req, mode, day);
      if (status) return res.status(409).json({ error: "You've already played today's quiz. A new one starts at 4am Eastern.", status, day });
      setDailyCookie(res, mode, day, "started");
      return res.status(200).json({ ok: true, day });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error("daily error", err);
    return res.status(500).json({ error: "Today's quiz is unavailable right now. Try again in a minute." });
  }
}
