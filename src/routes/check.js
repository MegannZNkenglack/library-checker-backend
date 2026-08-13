// src/routes/check.js
// The core library-check endpoint.
// - Enforces quota server-side (5/day free, unlimited premium)
// - Proxies NoveList so credentials never reach the extension
// - Saves check history per user

import { Hono } from "hono";
import db        from "../db.js";

const router = new Hono();

// ── Tier limits ───────────────────────────────────────────────────────────────

const DAILY_LIMITS = {
  free:    5,
  premium: Infinity,
};

// ── NoveList credentials from env ─────────────────────────────────────────────
// Env vars follow the pattern: NOVELIST_<SUBDOMAIN_UPPERCASE>
// e.g. hpl.bibliocommons.com → NOVELIST_HPL=profile:password

function getNovelISTCreds(libraryUrl) {
  try {
    const subdomain = new URL(libraryUrl).hostname.split(".")[0].toUpperCase();
    const envVal    = process.env[`NOVELIST_${subdomain}`];
    if (!envVal) return null;
    const [profile, password] = envVal.split(":");
    return { profile, password };
  } catch {
    return null;
  }
}

// ── Edition scoring (same logic as extension, but server-side) ────────────────

function normaliseFormat(raw) {
  if (!raw) return "UNKNOWN";
  const f = raw.toLowerCase().trim();
  if (["paperback","hardback","hardcover","large print","board book","trade paper","mass market"].some(t => f.includes(t))) return "PHYSICAL";
  if (["ebook","kindle","epub","pdf","e-book","digital","electronic"].some(t => f.includes(t))) return "DIGITAL";
  if (["audio cd","eaudio","audiobook","audio book","playaway","mp3","cd"].some(t => f.includes(t))) return "AUDIO";
  return "UNKNOWN";
}

function formatLabel(raw) {
  if (!raw) return null;
  const f = raw.toLowerCase().trim();
  if (f.includes("hardcover") || f.includes("hardback")) return "Hardcover";
  if (f.includes("paperback"))   return "Paperback";
  if (f.includes("large print")) return "Large Print";
  if (f.includes("kindle"))      return "Kindle";
  if (f.includes("ebook") || f.includes("e-book") || f.includes("epub")) return "eBook";
  if (f.includes("audiobook") || f.includes("audio book")) return "Audiobook";
  if (f.includes("eaudio"))      return "eAudiobook";
  return raw.trim();
}

function normaliseISBN(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9X]/gi, "");
  if (digits.length === 13) return digits;
  if (digits.length === 10) {
    const base = "978" + digits.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
    return base + ((10 - (sum % 10)) % 10);
  }
  return null;
}

function normaliseAuthor(raw) {
  if (!raw) return "";
  let s = raw.toLowerCase().replace(/[^a-z,\s]/g, "").replace(/\s+/g, " ").trim();
  s = s.split(/\band\b|&/)[0].trim();
  const commas = (s.match(/,/g) || []).length;
  if (commas === 1) s = s.split(", ").reverse().join(" ");
  else if (commas > 1) { const p = s.split(",").map(x => x.trim()).filter(Boolean); s = (p[1] + " " + p[0]).trim(); }
  return s.replace(/\s+/g, " ").trim();
}

function scoreAuthor(a, b) {
  const na = normaliseAuthor(a), nb = normaliseAuthor(b);
  if (!na || !nb) return 7;
  if (na === nb)  return 15;
  const aL = na.split(" ").pop(), bL = nb.split(" ").pop();
  if (aL && bL && aL === bL) return 8;
  if (na.includes(nb) || nb.includes(na)) return 5;
  return 0;
}

function scoreFormat(edFmt, pageFmt) {
  const m = {
    PHYSICAL: { PHYSICAL:30, AUDIO:10, DIGITAL:0,  UNKNOWN:20 },
    DIGITAL:  { PHYSICAL:30, AUDIO:10, DIGITAL:5,  UNKNOWN:20 },
    AUDIO:    { PHYSICAL:20, AUDIO:30, DIGITAL:0,  UNKNOWN:15 },
    UNKNOWN:  { PHYSICAL:30, AUDIO:10, DIGITAL:0,  UNKNOWN:20 },
  };
  return (m[pageFmt] ?? m.UNKNOWN)[edFmt] ?? 0;
}

function selectBestEdition(manifestations, userISBN, userAuthor, userTitle, pageFormat) {
  const candidates = manifestations.filter(m => m.Held === true && Array.isArray(m.BibIds) && m.BibIds.length > 0);
  if (!candidates.length) return null;

  const normISBN = normaliseISBN(userISBN);

  const scored = candidates.map(ed => {
    let score = 0;
    const fmt  = normaliseFormat(ed.MediaFormat);
    const isbn = normaliseISBN(ed.ISBN);
    if (normISBN && isbn && normISBN === isbn) score += 50;
    score += scoreFormat(fmt, pageFormat || "UNKNOWN");
    score += scoreAuthor(ed._author, userAuthor);
    const a = (ed.BibTitle || "").toLowerCase().replace(/[^a-z0-9\s]/g,"").trim();
    const b = (userTitle   || "").toLowerCase().replace(/[^a-z0-9\s]/g,"").trim();
    if (!a || !b || a.startsWith(b.split(" ")[0])) score += 5;
    return { ed, score, fmt, authorPts: scoreAuthor(ed._author, userAuthor) };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  if (top.score <= 22) return null;
  if (userAuthor && top.authorPts === 0 && top.score < 45) return null;

  if (top.fmt !== "PHYSICAL") {
    const near = scored.find(s => s.fmt === "PHYSICAL" && s.score >= top.score - 20 && s.score > 22);
    if (near) return near.ed;
  }
  return top.ed;
}

// ── NoveList fetch helper ─────────────────────────────────────────────────────

async function novelistFetch(endpoint, creds) {
  const url  = `https://novselect.ebscohost.com/Data/ContentByQuery${endpoint}&profile=${creds.profile}&password=${creds.password}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) return null;
  return resp.json();
}

function titleSearchUrl(title, author, libraryUrl) {
  // Strip trailing asterisks and similar UI artifacts (Goodreads' shelf
  // view appends a "*" to some author names) before they end up in an
  // actual search query — an unsanitised "*" sent to a library's search
  // box once returned a completely unrelated book as the top result.
  const sanitize   = (s) => (s || "").replace(/\*+\s*$/, "").trim();
  const clean      = sanitize(title).replace(/\s*\(.*?\)\s*$/, "").trim();
  const cleanAuthor = sanitize(author);
  const q = cleanAuthor ? `${clean} ${cleanAuthor}` : clean;
  return `${libraryUrl}/search?q=${encodeURIComponent(q)}&type=smart`;
}

// ── Availability check ────────────────────────────────────────────────────────

// BiblioCommons record URLs need a per-library branch-code prefix
// (e.g. Hamilton is S125C, Toronto is S234C) — without it the URL 500s.
// The prefix is just "S" + the library's own numeric ID + "C", which every
// BiblioCommons site exposes in its page's dataLayer script.
async function getBranchPrefix(libraryUrl) {
  try {
    const html = await (await fetch(libraryUrl)).text();
    const match = html.match(/"bc\.libraryId":(\d+)/);
    return match ? `S${match[1]}C` : "";
  } catch { return ""; }
}

async function checkAvailability(bibId, libraryUrl) {
  try {
    const url  = `${libraryUrl}/v2/records/${bibId}/availability?locale=en-CA`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const av   = data?.availability || data?.entities?.bibs?.[bibId]?.availability;
    if (!av) return null;
    const n = av.availableItems ?? av.available_items ?? av.availableCopies ?? null;
    if (n !== null) return n > 0 ? "available" : "on_hold";
    const s = (av.status || "").toLowerCase();
    if (s.includes("available") && !s.includes("not")) return "available";
    if (s.includes("checkout") || s.includes("hold"))  return "on_hold";
    return null;
  } catch { return null; }
}

// ── Main check logic ──────────────────────────────────────────────────────────

// Search the library's own catalog site directly. Used both when a library
// has no NoveList credentials at all, and as a fallback when NoveList's
// ISBN-only API (see below) recognizes the title but has no manifestation
// data for it (a real, fairly common gap in NoveList's coverage).
//
// Searching by the exact ISBN is precise enough on BiblioCommons that a hit
// confirms the actual edition — treated as in_catalog. A broader title
// search only confirms "the library has something for this title," not
// that it's the same edition, so that stays no_exact_edition.
// Confirms a search result actually looks like the book we searched for,
// not just that /some/ result exists. BiblioCommons' "smart"/"title" search
// does broad relevance matching across every format (books, music, movies,
// ...) — a title like "Die for You" can match a completely unrelated title
// ("101 Board Games to Try Before You Die") on shared words alone. This
// only checks the title text; it does NOT catch a same-titled result of a
// different format (e.g. a song with the identical title) — that needs
// actual format filtering, which BiblioCommons doesn't expose reliably on
// this endpoint as far as we've found.
function resultTitleLooksRight(html, matchIndex, searchTitle) {
  // 20000 chars, not a smaller window — each result's format-icon SVG
  // (long coordinate-heavy path data) sits between the record link and the
  // actual title text, and a too-small window can get swallowed entirely
  // by that icon before ever reaching real content.
  const text = html.slice(matchIndex, matchIndex + 20000)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const cleanTitle = (searchTitle || "").replace(/\s*\(.*?\)\s*$/, "").trim().toLowerCase();
  const words = cleanTitle.split(/\s+/).filter(Boolean);
  if (!words.length) return true; // nothing meaningful to verify against

  // Take the first few words AS WRITTEN — don't drop short ones like "of"
  // or "the" from the middle. Dropping them and rejoining what's left
  // fabricates a phrase that never appears in the real title (e.g. "court
  // thorns and" from "A Court of Thorns and Roses" once "of" is removed),
  // which rejected a book the library actually had. Checking a short
  // leading run of words (not the whole title) is still what allows an
  // edition-title difference at the end (e.g. "Sorcerer's" vs
  // "Philosopher's Stone") to pass.
  const phrase = words.slice(0, Math.min(3, words.length)).join(" ");
  return text.includes(phrase);
}

async function scrapeLibrarySearch(isbn, title, author, libraryUrl) {
  // BiblioCommons no longer renders a data-bib-id attribute — current
  // markup embeds real result links as /v2/record/S125C<bibId> instead.
  const recordLinkPattern = /\/v2\/record\/([A-Za-z0-9]+)/;

  if (isbn) {
    const url = `${libraryUrl}/search?q=${encodeURIComponent(isbn)}&type=smart`;
    try {
      const html  = await (await fetch(url)).text();
      const match = html.match(recordLinkPattern);
      if (match) {
        const numericId    = match[1].match(/\d+$/)?.[0];
        const availability = numericId ? await checkAvailability(numericId, libraryUrl) : null;
        return {
          status:    "in_catalog",
          matchedBy: "isbn_scrape",
          availability,
          searchUrl: `${libraryUrl}${match[0]}`,
        };
      }
    } catch {}
  }

  if (title) {
    const url = titleSearchUrl(title, author, libraryUrl);
    try {
      const html  = await (await fetch(url)).text();
      const match = html.match(recordLinkPattern);
      if (match && resultTitleLooksRight(html, match.index, title)) {
        return { status: "no_exact_edition", searchUrl: url };
      }
    } catch {}
  }

  return { status: "not_found" };
}

export async function checkLibrary({ isbn, title, author, pageFormat, libraryUrl }) {
  const creds = getNovelISTCreds(libraryUrl);
  if (!creds) return scrapeLibrarySearch(isbn, title, author, libraryUrl);

  let manifestations = null, titleInfoAuthor = null;

  // NoveList's ContentByQuery API only supports lookup by ISBN/UPC/ItemID —
  // it rejects free-text title search outright ("Missing an ISBN, UPC, or
  // ItemID!"), regardless of parameter name. So ISBN is the only query this
  // API can actually answer; everything else falls back to searching the
  // library's own site instead of guessing at an unsupported NoveList query.
  if (isbn) {
    const data = await novelistFetch(
      `?ClientIdentifier=${encodeURIComponent(isbn)}&ISBN=${encodeURIComponent(isbn)}`, creds
    );
    if (data?.TitleInfo?.manifestations?.length > 0) {
      manifestations  = data.TitleInfo.manifestations;
      titleInfoAuthor = data.TitleInfo.author || null;
    }
  }

  if (!manifestations) return scrapeLibrarySearch(isbn, title, author, libraryUrl);

  const stamped = manifestations.map(m => ({ ...m, _author: titleInfoAuthor || author }));
  const anyHeld = stamped.some(m => m.Held === true && Array.isArray(m.BibIds) && m.BibIds.length > 0);
  if (!anyHeld) return scrapeLibrarySearch(isbn, title, author, libraryUrl);

  const best = selectBestEdition(stamped, isbn, author, title, pageFormat);
  if (!best) {
    // The library holds this title — just not an edition we're confident
    // matches what the user's looking at. Let them browse what's there
    // instead of telling them it's not available at all.
    return { status: "no_exact_edition", searchUrl: titleSearchUrl(title, author, libraryUrl) };
  }

  const bibId        = best.BibIds[0];
  const [availability, branchPrefix] = await Promise.all([
    checkAvailability(bibId, libraryUrl),
    getBranchPrefix(libraryUrl),
  ]);
  return {
    status:       "in_catalog",
    matchedBy:    "isbn",
    availability,
    editionLabel: formatLabel(best.MediaFormat),
    searchUrl:    `${libraryUrl}/v2/record/${branchPrefix}${bibId}`,
  };
}

// ── POST /check ───────────────────────────────────────────────────────────────

router.post("/", async (c) => {
  const userId = c.get("userId");
  const tier   = c.get("userTier") || "free";
  const limit  = DAILY_LIMITS[tier] ?? DAILY_LIMITS.free;
  const today  = new Date().toISOString().slice(0, 10);

  // Quota check
  if (limit !== Infinity) {
    const row = db.prepare("SELECT count FROM usage WHERE user_id = ? AND date = ?").get(userId, today);
    const used = row?.count ?? 0;
    if (used >= limit) {
      return c.json({ status: "quota_exceeded", used, limit }, 429);
    }
  }

  const body = await c.req.json();
  const { isbn, title, author, pageFormat, libraryUrl, libraryName } = body;

  if (!libraryUrl) return c.json({ error: "libraryUrl is required" }, 400);

  const result = await checkLibrary({ isbn, title, author, pageFormat, libraryUrl });

  // Increment usage
  db.prepare(`
    INSERT INTO usage (user_id, date, count) VALUES (?, ?, 1)
    ON CONFLICT (user_id, date) DO UPDATE SET count = count + 1
  `).run(userId, today);

  const newUsage = db.prepare("SELECT count FROM usage WHERE user_id = ? AND date = ?").get(userId, today);

  // Save to history
  db.prepare(`
    INSERT INTO check_history (user_id, isbn, title, library_url, library_name, status, search_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, isbn || null, title || null, libraryUrl, libraryName || null, result.status, result.searchUrl || null);

  return c.json({
    ...result,
    used:  newUsage?.count ?? 1,
    limit: limit === Infinity ? null : limit,
  });
});

// ── POST /check/batch ──────────────────────────────────────────────────────────
// Shelf-scan endpoint: checks a whole page of books (from a Goodreads shelf)
// at once. Quota is intentionally separate from the single-book /check
// quota (see the shelf_scans table) — free users get 1 manual scan/day
// regardless of how many books are in it, premium gets unlimited. Coupling
// this to the existing low daily per-book cap is exactly the UX problem
// real feedback flagged: passive/bulk checking burns through a small quota
// fast and confusingly.

const MAX_BATCH_SIZE = 100; // matches Goodreads' largest "per page" option
const BATCH_CONCURRENCY = 4; // polite to the library site + NoveList, avoids request timeouts

router.post("/batch", async (c) => {
  const userId = c.get("userId");
  const tier   = c.get("userTier") || "free";
  const today  = new Date().toISOString().slice(0, 10);

  if (tier !== "premium") {
    const row = db.prepare("SELECT count FROM shelf_scans WHERE user_id = ? AND date = ?").get(userId, today);
    if ((row?.count ?? 0) >= 1) {
      return c.json({
        status:  "scan_quota_exceeded",
        message: "Free plan: 1 shelf scan per day. Upgrade for unlimited.",
      }, 429);
    }
  }

  const body = await c.req.json();
  const { books, libraryUrl, libraryName } = body;

  if (!libraryUrl) return c.json({ error: "libraryUrl is required" }, 400);
  if (!Array.isArray(books) || books.length === 0) {
    return c.json({ error: "books array is required" }, 400);
  }
  if (books.length > MAX_BATCH_SIZE) {
    return c.json({ error: `Too many books in one batch (max ${MAX_BATCH_SIZE})` }, 400);
  }

  const results = new Array(books.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < books.length) {
      const i    = nextIndex++;
      const book = books[i];
      try {
        const result = await checkLibrary({
          isbn: book.isbn, title: book.title, author: book.author,
          pageFormat: "UNKNOWN", libraryUrl,
        });
        results[i] = { ...book, ...result };
      } catch {
        results[i] = { ...book, status: "error" };
      }
    }
  }
  await Promise.all(Array.from({ length: BATCH_CONCURRENCY }, worker));

  db.prepare(`
    INSERT INTO shelf_scans (user_id, date, count) VALUES (?, ?, 1)
    ON CONFLICT (user_id, date) DO UPDATE SET count = count + 1
  `).run(userId, today);

  const insertHistory = db.prepare(`
    INSERT INTO check_history (user_id, isbn, title, library_url, library_name, status, search_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of results) {
    insertHistory.run(userId, r.isbn || null, r.title || null, libraryUrl, libraryName || null, r.status, r.searchUrl || null);
  }

  // Only premium users get ongoing monitoring — remember what was scanned
  // so the nightly rescan job has something to compare against.
  if (tier === "premium") {
    const upsertWatch = db.prepare(`
      INSERT INTO shelf_watches (user_id, library_url, library_name, title, author, isbn, last_status, last_availability, last_checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (user_id, library_url, title, author) DO UPDATE SET
        isbn              = excluded.isbn,
        library_name      = excluded.library_name,
        last_status       = excluded.last_status,
        last_availability = excluded.last_availability,
        last_checked_at   = excluded.last_checked_at
    `);
    for (const r of results) {
      if (!r.title) continue;
      upsertWatch.run(
        userId, libraryUrl, libraryName || null, r.title, r.author || null,
        r.isbn || null, r.status, r.availability || null
      );
    }
  }

  return c.json({ results });
});

// ── GET /check/usage ──────────────────────────────────────────────────────────

router.get("/usage", async (c) => {
  const userId = c.get("userId");
  const tier   = c.get("userTier") || "free";
  const today  = new Date().toISOString().slice(0, 10);
  const row    = db.prepare("SELECT count FROM usage WHERE user_id = ? AND date = ?").get(userId, today);
  const limit  = DAILY_LIMITS[tier];
  return c.json({ used: row?.count ?? 0, limit: limit === Infinity ? null : limit, tier });
});

// ── GET /check/history ────────────────────────────────────────────────────────

router.get("/history", async (c) => {
  const userId  = c.get("userId");
  const history = db.prepare(`
    SELECT * FROM check_history WHERE user_id = ? ORDER BY checked_at DESC LIMIT 50
  `).all(userId);
  return c.json({ history });
});

// ── DELETE /check/history ─────────────────────────────────────────────────────

router.delete("/history", async (c) => {
  const userId = c.get("userId");
  db.prepare("DELETE FROM check_history WHERE user_id = ?").run(userId);
  return c.json({ ok: true });
});

export default router;
