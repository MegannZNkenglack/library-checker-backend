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
  const clean = (title || "").replace(/\s*\(.*?\)\s*$/, "").trim();
  const q     = author ? `${clean} ${author}` : clean;
  return `${libraryUrl}/search?q=${encodeURIComponent(q)}&type=smart`;
}

// ── Availability check ────────────────────────────────────────────────────────

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

async function checkLibrary({ isbn, title, author, pageFormat, libraryUrl }) {
  const creds = getNovelISTCreds(libraryUrl);
  if (!creds) {
    // No creds for this library — fall back to HTML scraping
    const searches = [];
    if (isbn) searches.push(`${libraryUrl}/search?q=${encodeURIComponent(isbn)}&type=smart`);
    if (title) {
      const q = author ? `${title.replace(/\s*\(.*?\)\s*$/,"").trim()} ${author}` : title;
      searches.push(`${libraryUrl}/search?q=${encodeURIComponent(q)}&type=smart`);
    }
    for (const url of searches) {
      try {
        const html = await (await fetch(url)).text();
        if (/data-bib-id=["']\d+["']/.test(html)) return { status: "in_catalog", searchUrl: url };
      } catch {}
    }
    return { status: "not_found" };
  }

  let manifestations = null, titleInfoAuthor = null, matchedBy = "isbn";

  // Pass 1: ISBN
  if (isbn) {
    const data = await novelistFetch(
      `?ClientIdentifier=${encodeURIComponent(isbn)}&ISBN=${encodeURIComponent(isbn)}`, creds
    );
    if (data?.TitleInfo?.manifestations?.length > 0) {
      manifestations  = data.TitleInfo.manifestations;
      titleInfoAuthor = data.TitleInfo.author || null;
      const held      = manifestations.filter(m => m.Held).length;
      const exact     = manifestations.some(m => m.Held && m.BibIds?.length && normaliseISBN(m.ISBN) === normaliseISBN(isbn));
      if (held > 0 && !exact) return { status: "no_exact_edition", searchUrl: titleSearchUrl(title, author, libraryUrl) };
      if (held === 0)         return { status: "no_exact_edition", searchUrl: titleSearchUrl(title, author, libraryUrl) };
    } else if (data?.TitleInfo) {
      return { status: "no_exact_edition", searchUrl: titleSearchUrl(title, author, libraryUrl) };
    }
  }

  // Pass 2: title+author
  if (!manifestations && title) {
    matchedBy = isbn ? "title" : "title_only";
    const q    = (title.replace(/\s*\(.*?\)\s*$/,"").trim()) + (author ? ` ${author}` : "");
    const data = await novelistFetch(`?TitleSearch=${encodeURIComponent(q)}`, creds);
    if (data?.TitleInfo?.manifestations?.length > 0) {
      manifestations  = data.TitleInfo.manifestations;
      titleInfoAuthor = data.TitleInfo.author || null;
    }
  }

  if (!manifestations) return { status: "not_found" };

  const stamped = manifestations.map(m => ({ ...m, _author: titleInfoAuthor || author }));
  const best    = selectBestEdition(stamped, isbn, author, title, pageFormat);
  if (!best)    return { status: "not_found" };

  const bibId        = best.BibIds[0];
  const availability = await checkAvailability(bibId, libraryUrl);
  return {
    status:       "in_catalog",
    matchedBy,
    availability,
    editionLabel: formatLabel(best.MediaFormat),
    searchUrl:    `${libraryUrl}/v2/record/S125C${bibId}`,
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

export default router;
