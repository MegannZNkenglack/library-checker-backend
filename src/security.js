// src/security.js
// Shared security helpers: who is really calling, rate limits, response headers,
// a request log line that never contains secrets, and a startup config check.

const isProduction = () => process.env.NODE_ENV === "production";

// A request the caller got wrong (bad JSON, wrong types). index.js answers it with HTTP 400, not 500.
export class BadRequest extends Error {}

// ── Who is calling ────────────────────────────────────────────────────────────
// The leftmost X-Forwarded-For entry is whatever the caller wrote, so it can't key a
// rate limit (tested against the live site: 12 requests with 12 made-up values all
// got through a 10-per-10-minutes limit). In order of trust:
//   1. CF-Connecting-IP / True-Client-IP: set by Cloudflare, which sits in front of Render and
//      overwrites anything the caller sends.
//   2. X-Forwarded-For counted from the right: each proxy appends the address it saw, so
//      entries on the left can be forged but the ones the proxies added cannot.
//      TRUSTED_PROXY_HOPS (default 1) is how many entries on the right to skip.
export function clientIp(c) {
  const direct = c.req.header("cf-connecting-ip") || c.req.header("true-client-ip");
  if (direct) return direct.trim();
  const chain = (c.req.header("x-forwarded-for") || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!chain.length) return "unknown";
  const hops = Math.max(0, parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 0);
  return chain[Math.max(0, chain.length - 1 - hops)];
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// In memory (one server process), sliding window. A restart forgets the counts, which is
// fine for abuse control. allow(key) records an attempt and says whether it is within the limit.
export function createLimiter({ windowMs, max }) {
  const hits = new Map();   // key -> [timestamps]
  const fresh = (list, now) => list.filter(t => now - t < windowMs);
  return {
    allow(key, now = Date.now()) {
      const mine = fresh(hits.get(key) || [], now);
      if (mine.length >= max) { hits.set(key, mine); return false; }
      mine.push(now);
      hits.set(key, mine);
      if (hits.size > 10000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
      return true;
    },
    // Counts a failure only (used for wrong passwords: right ones shouldn't use up the allowance).
    blocked(key, now = Date.now()) {
      const mine = fresh(hits.get(key) || [], now);
      hits.set(key, mine);
      return mine.length >= max;
    },
    record(key, now = Date.now()) {
      const mine = fresh(hits.get(key) || [], now);
      mine.push(now);
      hits.set(key, mine);
    },
    clear(key) { key === undefined ? hits.clear() : hits.delete(key); },
  };
}

export const TOO_MANY = { error: "Too many attempts. Please wait a few minutes and try again." };

// Hono middleware: limit by client IP. Over the limit -> 429 with Retry-After.
export function limitByIp(limiter, message = TOO_MANY) {
  return async (c, next) => {
    if (!limiter.allow(clientIp(c))) {
      c.header("Retry-After", "300");
      return c.json(message, 429);
    }
    await next();
  };
}

// ── Response headers ──────────────────────────────────────────────────────────
// Website pages add their own Content-Security-Policy (site/index.js). These apply to everything,
// including the JSON API, which the extension and the website's scripts read.
export async function securityHeaders(c, next) {
  await next();
  const h = c.res.headers;
  const set = (k, v) => { if (!h.has(k)) h.set(k, v); };
  set("X-Content-Type-Options", "nosniff");
  set("Referrer-Policy", "strict-origin-when-cross-origin");
  set("X-Frame-Options", "DENY");
  set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  set("Cross-Origin-Opener-Policy", "same-origin");
  if (isProduction()) set("Strict-Transport-Security", "max-age=31536000");
  // Responses that belong to one signed-in person must never sit in a shared cache.
  if (/^\/(auth|check|billing|admin)(\/|$)/.test(c.req.path)) set("Cache-Control", "no-store");
}

// ── Request log ───────────────────────────────────────────────────────────────
// Same idea as hono/logger but the query string is dropped: the Google sign-in callback carries a
// one-time ?code=... that should not end up in log storage.
export async function requestLog(c, next) {
  const start = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
}

// ── Startup check ─────────────────────────────────────────────────────────────
// Prints names only, never values.
export function configWarnings(env = process.env) {
  const out = [];
  if (env.NODE_ENV !== "production") out.push("NODE_ENV is not 'production': secure-only headers are off and development behaviour is on.");
  if ((env.JWT_SECRET || "").length < 32) out.push("JWT_SECRET is shorter than 32 characters; use a long random value.");
  if (env.NODE_ENV === "production") {
    for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID", "EXTENSION_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]) {
      if (!env[name]) out.push(`${name} is not set.`);
    }
    if (!(env.SMTP_USER && env.SMTP_PASS)) out.push("SMTP_USER / SMTP_PASS are not set: sign-up and password-reset emails cannot be sent.");
    if (env.ADMIN_TOKEN && env.ADMIN_TOKEN.length < 16) out.push("ADMIN_TOKEN is shorter than 16 characters, so the admin page stays switched off.");
  }
  return out;
}
