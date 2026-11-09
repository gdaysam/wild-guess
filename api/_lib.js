// Shared helpers for the API routes. Files starting with "_" are not deployed as routes.
import fs from "node:fs";
import path from "node:path";

export const MODES = ["birds", "fish"];
export const ROUNDS = 10;

// ---------- the daily clock ----------
// A "day" runs from 4:00am to 3:59am US Eastern (America/New_York, so it follows daylight saving).
// Shifting the clock back four hours and reading the Eastern calendar date gives that day's key.
const ROLLOVER_HOURS = 4;
const eastern = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const dayKey = (ms = Date.now()) => eastern.format(new Date(ms - ROLLOVER_HOURS * 3600e3));

// The previous day's key, so a run started at 3:59am can still be posted a minute later.
export const previousDayKey = (ms = Date.now()) => dayKey(ms - 24 * 3600e3);

// Milliseconds until the next 4am Eastern rollover (searched minute by minute within a day; DST-safe).
export function msUntilNextDay(ms = Date.now()) {
  const today = dayKey(ms);
  let lo = 0, hi = 26 * 3600e3;
  while (hi - lo > 60e3) { const mid = (lo + hi) / 2; if (dayKey(ms + mid) === today) lo = mid; else hi = mid; }
  return Math.ceil(hi);
}

// ---------- the once-per-day cookie ----------
// wg_<mode> = "<day>.started" when a daily run begins, "<day>.posted" once its score is on the board.
export function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function dailyStatus(req, mode, day) {
  const v = readCookies(req)["wg_" + mode] || "";
  const [d, state] = v.split(".");
  return d === day ? state : null;           // "started" | "posted" | null
}
export function setDailyCookie(res, mode, day, state) {
  // Lasts two days, which covers the rest of today plus a late post just after rollover.
  res.setHeader("Set-Cookie", `wg_${mode}=${day}.${state}; Path=/; Max-Age=${2 * 86400}; HttpOnly; Secure; SameSite=Lax`);
}

// ---------- species data ----------
const cache = {};
export function loadSpecies(mode) {
  if (!cache[mode]) cache[mode] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", `${mode}.json`), "utf8"));
  return cache[mode];
}

// ---------- seeded quiz ----------
// Same rules as the practice game in index.html, with every random choice drawn from a generator
// seeded by "<day>:<mode>", so the whole day's quiz is the same for everyone.
function seeded(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PLAN = [
  { tiers: [1], same: 0, label: 1 }, { tiers: [1], same: 0, label: 1 }, { tiers: [1], same: 1, label: 1 },
  { tiers: [2], same: 1, label: 2 }, { tiers: [2], same: 2, label: 2 }, { tiers: [2, 3], same: 2, label: 2 },
  { tiers: [2, 3], same: 3, label: 3 }, { tiers: [3], same: 3, label: 3 }, { tiers: [3], same: 3, label: 4 }, { tiers: [3], same: 3, label: 4 },
];
export function buildDailyQuiz(mode, day) {
  const SPECIES = loadSpecies(mode), rnd = seeded(`${day}:${mode}`);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const familyOf = (f) => SPECIES.filter((b) => b.family === f);
  const used = new Set(), rounds = [];
  for (let r = 0; r < ROUNDS; r++) {
    const p = PLAN[r];
    let pool = SPECIES.filter((b) => !used.has(b.name) && p.tiers.includes(b.tier) &&
      (p.same === 0 || (b.family !== "misc" && familyOf(b.family).length - 1 >= p.same)));
    if (!pool.length) pool = SPECIES.filter((b) => !used.has(b.name) && b.family !== "misc");
    const target = pick(pool);
    used.add(target.name);
    const kin = shuffle(familyOf(target.family).filter((b) => b !== target)).sort((a, b) => b.tier - a.tier).slice(0, p.same + 1);
    const same = shuffle(kin).slice(0, p.same);
    const others = shuffle(SPECIES.filter((b) => b.family !== target.family || target.family === "misc"))
      .filter((b) => b !== target && !same.includes(b)).slice(0, 3 - same.length);
    rounds.push({
      label: p.label,
      target: target.name,
      options: [target, ...same, ...others].map((b) => ({ name: b.name, sci: b.sci, photo: pick(b.ph) })),
    });
  }
  return { mode, day, rounds };
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
export const modeFrom = (v) => (MODES.includes(v) ? v : null);
