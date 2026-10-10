// src/routes/libraries.js
// GET /libraries/search?q=...  — public, used by the extension's Settings tab.

import { Hono } from "hono";
import { searchLibraries } from "../library-search.js";

const router = new Hono();

// Light per-visitor limit: this is a cheap in-memory lookup, but it is public.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;
const hits = new Map();

export function allowSearch(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [key, list] of hits) if (!list.some(t => now - t < WINDOW_MS)) hits.delete(key);
  return true;
}

router.get("/search", (c) => {
  const ip = (c.req.header("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!allowSearch(ip)) return c.json({ error: "Too many searches — try again in a minute." }, 429);
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ results: searchLibraries(c.req.query("q")) });
});

export default router;
