// src/catalogs/polaris.js
// Print availability for libraries whose catalog runs on Polaris (the "PowerPAC", for example
// Brampton Library at catalogue.bramlib.on.ca). The catalog is read the way a browser reads it:
// run a search, then ask for that search's result list. Each result already says how many copies
// there are, how many are in and how many holds are waiting.
//
// Only libraries listed in src/data/libraries.json with catalog "polaris" are ever contacted, so a
// signed-in user cannot point the server at an arbitrary address.

import { readFileSync } from "fs";

const LIBRARIES = JSON.parse(readFileSync(new URL("../data/libraries.json", import.meta.url), "utf8"));

const REGISTRY = new Map();
for (const lib of LIBRARIES) {
  if (lib.catalog !== "polaris" || !lib.ctx) continue;
  try {
    const origin = new URL(lib.url).origin;
    REGISTRY.set(origin, { origin, ctx: lib.ctx, name: lib.name, overdrive: lib.overdrive || null });
  } catch { /* a bad entry is skipped, never fatal */ }
}

// The catalog's settings for a library address, or null when it isn't a registered Polaris catalog.
export function polarisConfigFor(libraryUrl) {
  try {
    const u = new URL(libraryUrl);
    return u.protocol === "https:" ? REGISTRY.get(u.origin) || null : null;
  } catch { return null; }
}

const LOAN_DAYS  = 21;                       // same rough loan length the BiblioCommons lookups use
const TIMEOUT_MS = 15000;
const MAX_HOPS   = 6;
const UA         = "LibraryChecker/1.0 (+https://library-checker-backend.onrender.com)";

// ── Reading pages ────────────────────────────────────────────────────────────

const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

function storeCookies(resp, jar) {
  const raw = typeof resp.headers.getSetCookie === "function"
    ? resp.headers.getSetCookie()
    : (resp.headers.get("set-cookie") || "").split(/,(?=\s*[^;,=\s]+=)/).filter(Boolean);
  for (const line of raw) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

// GET with a cookie jar, following redirects by hand so a redirect can never leave the library's own site.
async function get(url, jar, origin) {
  let current = url;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const headers = { "User-Agent": UA, Accept: "text/html,*/*" };
    if (jar.size) headers.Cookie = cookieHeader(jar);
    const resp = await fetch(current, { redirect: "manual", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    storeCookies(resp, jar);
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) throw new Error("catalog redirected without a location");
      const next = new URL(location, current);
      if (next.origin !== origin) throw new Error("catalog redirected off its own site");
      current = next.href;
      continue;
    }
    if (!resp.ok) throw new Error(`catalog returned ${resp.status}`);
    return resp.text();
  }
  throw new Error("catalog redirected too many times");
}

// A small cache, so repeated lookups (a shelf scan, the nightly re-check) don't hammer a small library's server.
const CACHE_MS = 5 * 60 * 1000, CACHE_MAX = 500;
const cache = new Map();
const cacheGet = (key) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.html;
  cache.delete(key);
  return null;
};
const cacheSet = (key, html) => {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), html });
};

// At most two searches at once per library, for the same reason.
const MAX_PARALLEL = 2;
const running = new Map(), waiting = new Map();
async function withSlot(origin, job) {
  while ((running.get(origin) || 0) >= MAX_PARALLEL) {
    await new Promise(resolve => waiting.set(origin, [...(waiting.get(origin) || []), resolve]));
  }
  running.set(origin, (running.get(origin) || 0) + 1);
  try { return await job(); }
  finally {
    running.set(origin, running.get(origin) - 1);
    const next = (waiting.get(origin) || []).shift();
    if (next) next();
  }
}

// Runs a search ("by" is the catalog's field code: ISBN, TI, ...) and returns the results page as HTML.
export async function searchPolaris(cfg, by, term) {
  const key = `${cfg.origin}|${by}|${term}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const html = await withSlot(cfg.origin, async () => {
    const jar = new Map();
    const query = `ctx=${encodeURIComponent(cfg.ctx)}&type=Keyword&term=${encodeURIComponent(term)}&by=${by}&sort=RELEVANCE&limit=TOM=*&query=&page=0&searchid=1`;
    await get(`${cfg.origin}/search/searchresults.aspx?${query}`, jar, cfg.origin);      // starts the search in our session
    return get(`${cfg.origin}/search/components/ajaxResults.aspx?page=1`, jar, cfg.origin); // the result list for it
  });
  // A page with neither results nor the empty result box is something else (an error page): don't trust it.
  if (!html.includes('id="searchResultsDIV"')) throw new Error("unexpected catalog page");
  cacheSet(key, html);
  return html;
}

// ── Understanding results ────────────────────────────────────────────────────

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘" };
const decode = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (html) => decode(String(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const COPIES = /(\d+)\s*\(\s*of\s*(\d+)\s*\)/i;

// Every record on a results page: title, author, format, where it is, and the copy counts.
export function parsePolarisResults(html, origin) {
  const blocks = String(html).split("content-module--search-result").slice(1);
  const records = [];
  for (const block of blocks) {
    const link = block.match(/class="nsm-brief-primary-title-group">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const href = decode(link[1]);
    const cn = href.match(/[?&]cn=(\d+)/i)?.[1];
    if (!cn) continue;

    const rec = {
      cn,
      url: new URL(href, origin + "/search/").href,
      title: text(link[2]),
      author: text(block.match(/nsm-brief-primary-author-group">([\s\S]*?)<\/div>/)?.[1] || "").replace(/^by\s+/i, ""),
      format: decode(block.match(/c-title-detail-formats__img"[^>]*?alt="([^"]*)"/)?.[1] || ""),
      local: null, system: null, holds: null,
    };

    for (const group of block.matchAll(/<div class="nsm-brief-standard-group">([\s\S]*?)<\/div>/g)) {
      const label = text(group[1].match(/<span class="nsm-brief-label[^"]*">([\s\S]*?)<\/span>/)?.[1] || "").replace(/:$/, "").toLowerCase();
      const value = text(group[1].replace(/<span class="nsm-brief-label[^"]*">[\s\S]*?<\/span>/, ""));
      const copies = value.match(COPIES);
      if (label === "local availability" && copies)  rec.local  = { available: Number(copies[1]), total: Number(copies[2]) };
      if (label === "system availability" && copies) rec.system = { available: Number(copies[1]), total: Number(copies[2]) };
      if (label === "current holds" && /^\d+$/.test(value)) rec.holds = Number(value);
    }
    records.push(rec);
  }
  return records;
}

// Copy counts in the same shape the BiblioCommons lookups produce.
export function polarisAvailability(rec) {
  const copies = rec.local || rec.system;
  if (!copies || copies.total <= 0) return null;
  const heldCopies = rec.holds || 0;
  if (copies.available > 0) return { state: "available", availableCopies: copies.available, totalCopies: copies.total, heldCopies };
  return {
    state: "on_hold", availableCopies: 0, totalCopies: copies.total, heldCopies,
    estimatedWaitDays: Math.ceil((heldCopies + 1) / copies.total) * LOAN_DAYS,
  };
}

// Formats that are not a book on a shelf (the digital side is looked up separately through Libby).
const NOT_PRINT = /e-?book|e-?audio|download|streaming|dvd|blu-?ray|video|cd\b|music|game|kit|magazine|periodical/i;

export function pickPrintRecord(records) {
  const print = records.filter(r => !NOT_PRINT.test(r.format) || /book/i.test(r.format) && !/e-?book/i.test(r.format));
  // Most copies first: the edition people are most likely to be able to borrow.
  return [...print].sort((a, b) => ((b.local || b.system)?.total || 0) - ((a.local || a.system)?.total || 0))[0] || null;
}

const norm = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const mainTitle = (s) => norm(String(s || "").split(/[:(]/)[0]);

export function titleLooksRight(resultTitle, searchTitle) {
  const a = mainTitle(resultTitle), b = mainTitle(searchTitle);
  return Boolean(a && b && (a === b || a.startsWith(b + " ") || b.startsWith(a + " ")));
}

// A results page a person can open (their own browser starts its own session).
export function polarisSearchUrl(cfg, by, term) {
  return `${cfg.origin}/search/searchresults.aspx?ctx=${encodeURIComponent(cfg.ctx)}&type=Keyword&term=${encodeURIComponent(term)}&by=${by}&sort=RELEVANCE&limit=TOM=*&query=&page=0`;
}

// ── The check itself ─────────────────────────────────────────────────────────

// Returns the same fields as the other print lookups: status, availability, holds, searchUrl.
export async function checkPolaris({ isbn, title, author, cfg }) {
  let couldNotAsk = false;

  if (isbn) {
    try {
      const rec = pickPrintRecord(parsePolarisResults(await searchPolaris(cfg, "ISBN", isbn), cfg.origin));
      if (rec) {
        const av = polarisAvailability(rec);
        const { state, ...holds } = av || {};
        return { status: "in_catalog", matchedBy: "isbn_scrape", availability: av ? state : null, ...(av ? { holds } : {}), searchUrl: rec.url };
      }
    } catch { couldNotAsk = true; }
  }

  if (title) {
    const clean = String(title).replace(/\s*\(.*?\)\s*$/, "").replace(/\*+\s*$/, "").trim();
    try {
      const records = parsePolarisResults(await searchPolaris(cfg, "TI", clean), cfg.origin);
      if (records.some(r => titleLooksRight(r.title, clean) && !NOT_PRINT.test(r.format))) {
        return { status: "no_exact_edition", searchUrl: polarisSearchUrl(cfg, "TI", clean) };
      }
    } catch { couldNotAsk = true; }
  }

  return { status: couldNotAsk ? "error" : "not_found" };
}
