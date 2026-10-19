// src/site/index.js
// The public website: pages, static assets, sitemap/robots, and the contact form.

import { readFileSync } from "fs";
import { Hono } from "hono";
import { SITE_URL } from "./layout.js";
import { home, pricing, libraries } from "./pages-main.js";
import { help, faq, whatsNew, contact, CONTACT_TOPICS } from "./pages-support.js";
import { privacy, terms, billingSuccess, billingCancel, notFound } from "./pages-legal.js";
import { sendContactEmail } from "../email.js";
import { clientIp } from "../security.js";
import { LIBRARY_PAGES, libraryPage } from "./pages-library.js";
import { guide, GUIDE_PDF, GUIDE_VIDEO } from "./pages-guide.js";
import { GUIDE_IMAGES, loadGuideFile, bytesResponse } from "./media.js";

const site = new Hono();

// ── Pages ────────────────────────────────────────────────────────────────────
// Rendered once at startup (they don't change while the server runs).

const PAGES = [
  { path: "/",           html: home(),        index: true },
  { path: "/pricing",    html: pricing(),     index: true },
  { path: "/libraries",  html: libraries(),   index: true },
  { path: "/help",       html: help(),        index: true },
  { path: "/guide",      html: guide(),       index: true },
  { path: "/faq",        html: faq(),         index: true },
  { path: "/whats-new",  html: whatsNew(),    index: true },
  { path: "/contact",    html: contact(),     index: true },
  { path: "/privacy",    html: privacy(),     index: true },
  { path: "/terms",      html: terms(),       index: true },
  ...LIBRARY_PAGES.map(l => ({ path: l.path, html: libraryPage(l), index: true })),
  { path: "/billing/success", html: billingSuccess(), index: false },
  { path: "/billing/cancel",  html: billingCancel(),  index: false },
];
export const NOT_FOUND_HTML = notFound();

// Keeps the site self-contained: nothing runs or loads from anywhere else except
// the Google Fonts stylesheet and font files.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "object-src 'none'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function htmlHeaders(c) {
  c.header("Content-Security-Policy", CSP);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
}

for (const { path, html, index } of PAGES) {
  site.get(path, (c) => {
    htmlHeaders(c);
    c.header("Cache-Control", index ? "public, max-age=300" : "no-store");
    return c.html(html);
  });
}

// ── Static assets ────────────────────────────────────────────────────────────

const asset = (file) => readFileSync(new URL(`./assets/${file}`, import.meta.url));
const ASSETS = {
  "site.css":     { body: asset("site.css"),     type: "text/css; charset=utf-8" },
  "site.js":      { body: asset("site.js"),      type: "application/javascript; charset=utf-8" },
  "admin.js":     { body: asset("admin.js"),     type: "application/javascript; charset=utf-8" },
  "icon-32.png":  { body: asset("icon-32.png"),  type: "image/png" },
  "icon-128.png": { body: asset("icon-128.png"), type: "image/png" },
};

site.get("/assets/:file", (c) => {
  const found = ASSETS[c.req.param("file")];
  if (!found) return c.notFound();
  return new Response(found.body, {
    headers: {
      "Content-Type": found.type,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

site.get("/favicon.ico", (c) =>
  new Response(ASSETS["icon-32.png"].body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } }));

// ── Guide: the PDF, the video and the pictures (see media.js) ────────────────
// Kept at fixed, shareable addresses, e.g. for linking the PDF in an email.

async function guideFile(c, relativePath, type, disposition) {
  const file = await loadGuideFile(relativePath);
  return file ? bytesResponse(c.req, file, { type, disposition }) : c.notFound();
}

site.get(GUIDE_PDF,   (c) => guideFile(c, "library-checker-guide.pdf", "application/pdf", 'inline; filename="library-checker-guide.pdf"'));
site.get(GUIDE_VIDEO, (c) => guideFile(c, "library-checker-how-to.mp4", "video/mp4"));
site.get("/guide/img/:file", (c) => {
  const name = c.req.param("file");
  return GUIDE_IMAGES.has(name) ? guideFile(c, `img/${name}`, "image/png") : c.notFound();
});

// ── robots.txt and sitemap.xml ───────────────────────────────────────────────

site.get("/robots.txt", (c) =>
  c.text(`User-agent: *\nAllow: /\nDisallow: /auth/\nDisallow: /check/\nDisallow: /libraries/search\nDisallow: /billing/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`));

site.get("/sitemap.xml", (c) => {
  const urls = PAGES.filter(p => p.index)
    .map(p => `  <url><loc>${SITE_URL}${p.path === "/" ? "/" : p.path}</loc></url>`).join("\n");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 200, {
    "Content-Type": "application/xml; charset=utf-8",
  });
});

// ── Contact form ─────────────────────────────────────────────────────────────

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPIC_LABELS  = Object.fromEntries(CONTACT_TOPICS);

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_PER_IP    = 3;
const RATE_GLOBAL    = 60;
const hits = new Map();   // ip -> [timestamps]
let globalHits = [];

const recent = (list, now) => list.filter(t => now - t < RATE_WINDOW_MS);

// Returns true (and records the attempt) when this visitor is still within the limits.
export function allowContactAttempt(ip, now = Date.now()) {
  globalHits = recent(globalHits, now);
  const mine = recent(hits.get(ip) || [], now);
  if (mine.length >= RATE_PER_IP || globalHits.length >= RATE_GLOBAL) {
    hits.set(ip, mine);
    return false;
  }
  mine.push(now);
  globalHits.push(now);
  hits.set(ip, mine);
  if (hits.size > 5000) {                       // keep memory bounded
    for (const [key, list] of hits) if (!recent(list, now).length) hits.delete(key);
  }
  return true;
}

export const _resetContactLimits = () => { hits.clear(); globalHits = []; };

site.post("/contact", async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: "Please fill in the form and try again." }, 400); }

  const name    = String(body.name || "").trim().slice(0, 100);
  const email   = String(body.email || "").trim().slice(0, 200);
  const message = String(body.message || "").trim();
  const topic   = TOPIC_LABELS[body.topic] ? body.topic : "other";

  // Bots tend to fill the hidden field or submit instantly. Answer "ok" so they
  // learn nothing, but send nothing.
  if (body.website || (Number(body.elapsed) || 0) < 2000) return c.json({ ok: true });

  if (!EMAIL_PATTERN.test(email)) return c.json({ error: "Please enter a valid email address so we can reply." }, 400);
  if (message.length < 10)        return c.json({ error: "Please write a little more so we can help." }, 400);
  if (message.length > 5000)      return c.json({ error: "That message is too long — please keep it under 5,000 characters." }, 400);

  if (!allowContactAttempt(clientIp(c))) {
    return c.json({ error: "You've sent a few messages recently. Please try again in an hour." }, 429);
  }

  const sent = await sendContactEmail({ name, email, topicLabel: TOPIC_LABELS[topic], message });
  if (!sent) return c.json({ error: "We couldn't send your message right now. Please try again a little later." }, 503);
  return c.json({ ok: true });
});

export default site;
