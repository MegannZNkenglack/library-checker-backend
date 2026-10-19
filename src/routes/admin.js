// src/routes/admin.js
// Private stats page. Off unless ADMIN_TOKEN is set to a long secret (16+ chars).
//   GET  /admin        -> the page (no data in it)
//   POST /admin/stats  -> the numbers, only with "Authorization: Bearer <ADMIN_TOKEN>"
// The token is typed into the page and sent in a header, never put in a URL, so
// it doesn't end up in logs or browser history.

import { createHash, timingSafeEqual } from "crypto";
import { Hono } from "hono";
import { computeStats } from "../stats.js";
import { adminPage } from "../site/pages-admin.js";
import { htmlHeaders } from "../site/index.js";
import { clientIp } from "../security.js";

const router = new Hono();

const enabled = () => (process.env.ADMIN_TOKEN || "").length >= 16;

const digest = (s) => createHash("sha256").update(String(s)).digest();
export function tokenMatches(given) {
  if (!enabled() || !given) return false;
  return timingSafeEqual(digest(given), digest(process.env.ADMIN_TOKEN));
}

// Slows down guessing: 5 wrong tries per visitor per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_FAILURES_ALL = 40;   // from every address together: guessing from many addresses at once is stopped too
const failures = new Map();
let allFailures = [];
const recent = (list, now) => list.filter(t => now - t < WINDOW_MS);
export const _resetAdminLimits = () => { failures.clear(); allFailures = []; };

router.get("/", (c) => {
  if (!enabled()) return c.notFound();
  htmlHeaders(c);
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  return c.html(adminPage());
});

router.post("/stats", (c) => {
  if (!enabled()) return c.notFound();
  const now = Date.now();
  const ip  = clientIp(c);
  const prior = recent(failures.get(ip) || [], now);
  allFailures = recent(allFailures, now);
  if (prior.length >= MAX_FAILURES || allFailures.length >= MAX_FAILURES_ALL) return c.json({ error: "Too many wrong attempts. Try again later." }, 429);

  const given = (c.req.header("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tokenMatches(given)) {
    failures.set(ip, [...prior, now]);
    allFailures.push(now);
    return c.json({ error: "Wrong token." }, 401);
  }
  failures.delete(ip);
  c.header("Cache-Control", "no-store");
  return c.json(computeStats());
});

export default router;
