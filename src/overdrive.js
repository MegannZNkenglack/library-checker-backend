// src/overdrive.js
// Digital (Libby/OverDrive) availability. Uses OverDrive's public "Thunder"
// API, which needs no login and reports copies, holds and an estimated wait.
//
// Two jobs:
//   1. Work out which OverDrive library belongs to a BiblioCommons library
//      (resolveOverdriveKey) — by matching the library's own website domain
//      against OverDrive's directory, falling back to its exact name.
//   2. Find the book in that library's digital catalog (checkDigital).

import { readFileSync } from "fs";
import db from "./db.js";

// If the directory file is ever missing, digital lookups quietly switch off instead of crashing the server.
let directory = [];
try {
  directory = JSON.parse(readFileSync(new URL("./data/overdrive-libraries.json", import.meta.url), "utf8"));
} catch (err) {
  console.error("[OverDrive] library directory unavailable, digital checks disabled:", err.message);
}

const THUNDER = "https://thunder.api.overdrive.com/v2";
const POSITIVE_TTL_DAYS = 90;
const NEGATIVE_TTL_DAYS = 7;

// A library that is only known by its OverDrive/Libby account (its catalog runs
// on a system we can't search) is stored as "overdrive:<key>" instead of a web
// address. Only keys that exist in the OverDrive directory are accepted.
export const OVERDRIVE_PREFIX = "overdrive:";
export const overdriveDirectory = directory;
const directoryKeys = new Set(directory.map(l => l.key));

export function overdriveKeyFromUrl(url) {
  if (typeof url !== "string" || !url.startsWith(OVERDRIVE_PREFIX)) return null;
  const key = url.slice(OVERDRIVE_PREFIX.length);
  return directoryKeys.has(key) ? key : null;
}

// ── Normalising helpers ──────────────────────────────────────────────────────

const INVISIBLE = /[\u200B\u200C\u200D\uFEFF\u2060]/g;
const APOSTROPHES = /&#x27;|&#39;|&apos;|&rsquo;|&#8217;|['’]/gi;

function hostOf(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

function normName(name) {
  return String(name || "").toLowerCase()
    .replace(/(.*?)/g, " ")          // "Hennepin County Library (Minneapolis)" -> without the note
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^the /, "");
}

// "A Court of Thorns and Roses (A Court of Thorns and Roses, #1)" -> "court of thorns and roses"
// "Atomic Habits: An Easy & Proven Way..."                       -> "atomic habits"
function mainTitle(title) {
  return String(title || "")
    .replace(INVISIBLE, "").replace(APOSTROPHES, "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .split(/\s*[:–—]\s+|\s+-\s+/)[0]
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^(the|a|an) /, "");
}

// Name tokens without initials: "Michaelides, Alex" / "Alex Michaelides" -> [alex, michaelides]
function nameTokens(name) {
  return String(name || "").replace(INVISIBLE, "").replace(/\*+\s*$/, "")
    .toLowerCase().split(/[^a-z]+/).filter(t => t.length > 1);
}

function authorMatches(bookAuthor, itemAuthor) {
  const a = nameTokens(bookAuthor);
  const b = nameTokens(itemAuthor);
  if (!a.length || !b.length) return true; // nothing to compare — rely on the title
  return a.every(t => b.includes(t)) || b.every(t => a.includes(t));
}

// ── Directory indexes ────────────────────────────────────────────────────────

const byHost = new Map();
const byName = new Map();
for (const lib of directory) {
  const h = lib.home && hostOf(lib.home);
  if (h) byHost.set(h, [...(byHost.get(h) || []), lib]);
  const n = normName(lib.name);
  byName.set(n, [...(byName.get(n) || []), lib]);
}

// ── Library -> OverDrive key ─────────────────────────────────────────────────

const keyMemo = new Map();

// Exact (normalised) name match, accepted only when it's unambiguous.
function matchByName(...names) {
  for (const name of names) {
    const hits = byName.get(normName(name));
    if (hits?.length === 1) return hits[0].key;
  }
  return null;
}

function matchDirectory(cmsUrl, longName) {
  const host = cmsUrl && hostOf(cmsUrl);
  const nameKey = normName(longName);
  if (host) {
    const hits = byHost.get(host);
    if (hits?.length === 1) return hits[0].key;
    if (hits?.length > 1) {
      const named = hits.find(l => normName(l.name) === nameKey);
      return (named || hits[0]).key;
    }
  }
  const named = byName.get(nameKey);
  return named?.length === 1 ? named[0].key : null;
}

// Returns the OverDrive library key for a BiblioCommons site, or null when the
// library has no OverDrive presence we can identify (e.g. it uses another
// platform such as cloudLibrary). Results — including "none" — are cached.
export async function resolveOverdriveKey(libraryUrl, libraryName) {
  const direct = overdriveKeyFromUrl(libraryUrl);
  if (direct) return direct;
  if (keyMemo.has(libraryUrl)) return keyMemo.get(libraryUrl);

  const row = db.prepare("SELECT overdrive_key, resolved_at FROM overdrive_map WHERE library_url = ?").get(libraryUrl);
  if (row) {
    const ageDays = (Date.now() - new Date(row.resolved_at + "Z").getTime()) / 86400000;
    if (ageDays < (row.overdrive_key ? POSITIVE_TTL_DAYS : NEGATIVE_TTL_DAYS)) {
      keyMemo.set(libraryUrl, row.overdrive_key);
      return row.overdrive_key;
    }
  }

  // The library's name (sent by the extension) settles most cases without
  // touching the library's own site; the site is only consulted for names
  // that are missing or ambiguous (several libraries can share a name).
  let key = matchByName(libraryName);
  if (!key) try {
    const html = await (await fetch(libraryUrl, { signal: AbortSignal.timeout(8000) })).text();
    const cms  = html.match(/"bc\.cmsUrl":"([^"]*)"/)?.[1];
    const name = html.match(/"bc\.longName":"([^"]*)"/)?.[1];
    key = matchDirectory(cms, name);
  } catch {
    return null; // transient failure: don't cache, try again next time
  }

  db.prepare(`
    INSERT INTO overdrive_map (library_url, overdrive_key, resolved_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT (library_url) DO UPDATE SET overdrive_key = excluded.overdrive_key, resolved_at = excluded.resolved_at
  `).run(libraryUrl, key);
  keyMemo.set(libraryUrl, key);
  return key;
}

// ── Book lookup ──────────────────────────────────────────────────────────────

function summarise(item, key) {
  return {
    available:         Boolean(item.isAvailable),
    ownedCopies:       item.ownedCopies ?? null,
    availableCopies:   item.availableCopies ?? null,
    holdsCount:        item.holdsCount ?? 0,
    estimatedWaitDays: item.isAvailable ? null : (item.estimatedWaitDays ?? null),
    overdriveUrl:      `https://${key}.overdrive.com/media/${item.id}`,
    libbyUrl:          `https://share.libbyapp.com/title/${item.id}`,
  };
}

// Among several matching editions of one kind (e.g. two ebook editions), show
// the one the reader can get soonest.
function bestOf(items, key) {
  if (!items.length) return null;
  const rank = (i) => i.isAvailable ? -1 : (i.estimatedWaitDays ?? Number.MAX_SAFE_INTEGER);
  return summarise([...items].sort((x, y) => rank(x) - rank(y))[0], key);
}

// Returns null when digital lookup isn't possible (no OverDrive library found,
// or the API is unreachable). Otherwise { libraryKey, ebook, audiobook } where
// each of ebook/audiobook is either a summary or null (not in that format).
export async function checkDigital({ title, author, libraryUrl, libraryName }) {
  const wanted = mainTitle(title);
  if (!wanted) return null;

  const key = await resolveOverdriveKey(libraryUrl, libraryName);
  if (!key) return null;

  const cleanAuthor = String(author || "").replace(INVISIBLE, "").replace(/\*+\s*$/, "").trim();
  const query = [String(title).replace(INVISIBLE, "").replace(/\s*\(.*?\)\s*$/, "").split(/\s*:\s+/)[0], cleanAuthor]
    .filter(Boolean).join(" ");

  try {
    const url = `${THUNDER}/libraries/${encodeURIComponent(key)}/media?query=${encodeURIComponent(query)}&perPage=15&page=1`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const items = (await resp.json()).items || [];

    const matches = items.filter(it =>
      mainTitle(it.title) === wanted && authorMatches(cleanAuthor, it.firstCreatorName)
    );

    return {
      libraryKey: key,
      ebook:     bestOf(matches.filter(it => it.type?.id === "ebook"), key),
      audiobook: bestOf(matches.filter(it => it.type?.id === "audiobook"), key),
    };
  } catch { return null; }
}

// Collapses a digital result into one word for the nightly rescan to compare:
// "available" (an eBook or audiobook can be borrowed right now), "waiting" (the
// library has it but every copy is out), or null (not in the digital catalog
// or couldn't tell).
export function digitalState(digital) {
  const kinds = digital ? [digital.ebook, digital.audiobook].filter(Boolean) : [];
  if (!kinds.length) return null;
  return kinds.some(k => k.available) ? "available" : "waiting";
}

// Names of the digital formats that can be borrowed right now.
export function availableDigitalFormats(digital) {
  const out = [];
  if (digital?.ebook?.available)     out.push("eBook");
  if (digital?.audiobook?.available) out.push("Audiobook");
  return out;
}

// Exported for tests.
export const _internal = { mainTitle, authorMatches, matchDirectory, matchByName, normName, hostOf };
