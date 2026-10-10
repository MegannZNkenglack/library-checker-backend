// src/library-search.js
// Finds libraries by name: the fully supported BiblioCommons libraries plus every
// library in OverDrive's directory (digital copies only — their print catalog
// runs on a system we can't search yet).

import { readFileSync } from "fs";
import { overdriveDirectory, OVERDRIVE_PREFIX } from "./overdrive.js";

const SUPPORTED = JSON.parse(readFileSync(new URL("./data/libraries.json", import.meta.url), "utf8"));

const norm = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

function hostOf(url) {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

// Libraries already covered by a supported entry (their digital side comes with it).
const coveredKeys = new Set(SUPPORTED.map(l => l.overdrive).filter(Boolean));

const CANDIDATES = [
  ...SUPPORTED.map(l => ({
    kind: "bibliocommons", name: l.name, url: l.url, country: l.country,
    digital: Boolean(l.overdrive), home: null, search: norm(l.name),
  })),
  ...overdriveDirectory.filter(l => !coveredKeys.has(l.key)).map(l => {
    const home = l.home ? hostOf(l.home) : null;
    return {
      kind: "overdrive", name: l.name, url: OVERDRIVE_PREFIX + l.key, country: null,
      digital: true, home, search: norm(l.name) + (home ? " " + home.replace(/\./g, " ") : ""),
    };
  }),
];

function score(candidate, query, tokens) {
  const name = norm(candidate.name);
  if (!tokens.every(t => candidate.search.includes(t))) return 0;
  if (name === query)               return 100;
  if (name.startsWith(query))       return 80;
  if (name.split(" ").some(w => w.startsWith(tokens[0]))) return 60;
  return 40;
}

// Returns up to `limit` matches, best first. Fully supported libraries win ties.
export function searchLibraries(rawQuery, limit = 15) {
  const query  = norm(String(rawQuery || "").slice(0, 80));
  const tokens = query.split(" ").filter(Boolean);
  if (query.length < 2) return [];

  return CANDIDATES
    .map(c => ({ c, s: score(c, query, tokens) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.c.kind === "bibliocommons" ? -1 : 1) - (b.c.kind === "bibliocommons" ? -1 : 1) || a.c.name.length - b.c.name.length)
    .slice(0, limit)
    .map(({ c }) => ({ kind: c.kind, name: c.name, url: c.url, country: c.country, digital: c.digital, home: c.home }));
}

export const _counts = { supported: SUPPORTED.length, total: CANDIDATES.length };
