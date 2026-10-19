// src/index.js
// Library Checker backend — Hono + Node.js

import "dotenv/config";
import { serve }   from "@hono/node-server";
import { Hono }    from "hono";
import { cors }    from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";

import cron from "node-cron";

import { requireAuth }     from "./auth.js";
import { BadRequest, clientIp, configWarnings, createLimiter, limitByIp, requestLog, securityHeaders } from "./security.js";
import authRouter          from "./routes/auth.js";
import checkRouter         from "./routes/check.js";
import billingRouter       from "./routes/billing.js";
import { runNightlyRescan } from "./rescan.js";
import site, { NOT_FOUND_HTML, htmlHeaders } from "./site/index.js";
import librariesRouter from "./routes/libraries.js";
import adminRouter from "./routes/admin.js";

const app  = new Hono();
const PORT = parseInt(process.env.PORT || "3000");

// ── CORS ───────────────────────────────────────────────────────────────────────
// Allow requests from the Chrome extension and your landing page.
// Chrome extensions use chrome-extension://EXTENSION_ID as their origin.

// Exact origins only (no wildcards). Local development origins are left out in production.
const allowedOrigins = [
  ...(process.env.EXTENSION_ID ? [`chrome-extension://${process.env.EXTENSION_ID}`] : []),
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://localhost:5173"]),
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean) : []),
];

// ── Security headers, request size, logging ─────────────────────────────────────
// Headers first so even errors and rejected requests carry them.
app.use("*", securityHeaders);
app.use("*", requestLog);   // method, path, status, time: never the query string (it can hold a sign-in code)
app.use("*", bodyLimit({
  maxSize: 1024 * 1024,     // 1 MB: the biggest real request (a 100-book shelf scan) is a few tens of KB
  onError: (c) => c.json({ error: "Request too large" }, 413),
}));

app.use("*", cors({
  origin: (origin) => allowedOrigins.includes(origin) ? origin : null,
  allowMethods:  ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders:  ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge:        600,
}));

// ── Rate limits ────────────────────────────────────────────────────────────────
// A general ceiling per visitor address across the account and lookup API (the sign-in and code
// endpoints have tighter limits of their own in routes/auth.js). Stripe's webhook is not limited.
const apiLimit = createLimiter({ windowMs: 60 * 1000, max: 240 });
app.use("/auth/*", limitByIp(apiLimit));
app.use("/check/*", limitByIp(apiLimit));
app.use("/billing/checkout", limitByIp(apiLimit));
app.use("/billing/portal", limitByIp(apiLimit));
export const _resetApiLimits = () => apiLimit.clear();

// Per signed-in account too: a lookup contacts the library's website, so one account (premium has
// no daily cap) must not be able to hammer it.
const userLimit = createLimiter({ windowMs: 60 * 1000, max: 120 });
export const _resetUserLimits = () => userLimit.clear();

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok" }));

// ── Public website ────────────────────────────────────────────────────────────
// Home, pricing, libraries, help, guide, FAQ, what's new, contact, privacy, terms and
// the Stripe checkout result pages (/billing/success, /billing/cancel — point
// STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL at them). See src/site/.
app.route("/", site);

// Public library search (name -> library) used by the extension's Settings tab.
app.route("/libraries", librariesRouter);

// Private stats page — only exists when ADMIN_TOKEN is set (see routes/admin.js).
app.route("/admin", adminRouter);

// ── Auth routes (no auth required) ────────────────────────────────────────────
app.route("/auth", authRouter);

// ── Protected routes ───────────────────────────────────────────────────────────
// requireAuth runs first, then passes to the route handler.
app.use("/check/*", requireAuth);
app.use("/check/*", async (c, next) => {
  if (!userLimit.allow(String(c.get("userId")))) {
    c.header("Retry-After", "60");
    return c.json({ error: "You're going a bit fast. Please wait a moment and try again." }, 429);
  }
  await next();
});

// Billing auth is applied per-route inside routes/billing.js instead of here,
// so that /billing/webhook (called by Stripe, not the extension) stays public.
app.route("/check",   checkRouter);
app.route("/billing", billingRouter);

// ── 404 handler ────────────────────────────────────────────────────────────────
// Browsers asking for a missing web page get a friendly page; API clients get JSON.
const API_PREFIXES = ["/auth/", "/check", "/billing/"];
app.notFound((c) => {
  const wantsHtml = c.req.method === "GET" && (c.req.header("accept") || "").includes("text/html");
  if (wantsHtml && !API_PREFIXES.some((p) => c.req.path.startsWith(p))) {
    htmlHeaders(c);
    return c.html(NOT_FOUND_HTML, 404);
  }
  return c.json({ error: "Not found" }, 404);
});

// ── Error handler ──────────────────────────────────────────────────────────────
// Never sends details (stack traces, file paths, SQL) back to the caller.
app.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  if (err instanceof SyntaxError) return c.json({ error: "Invalid request" }, 400);   // body wasn't valid JSON
  if (err instanceof HTTPException) return err.getResponse();
  console.error("[Error]", c.req.method, c.req.path, err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// ── Nightly shelf rescan ──────────────────────────────────────────────────────
// 3am server time (UTC on Render) — re-checks premium users' watched shelf
// books and emails them about anything newly available. Runs in-process
// rather than as a separate Render Cron service, since this is already a
// persistent (non-serverless) instance; the tradeoff is a scan gets missed
// if a deploy happens to land at exactly 3am, which is an acceptable risk
// for a once-daily, non-critical job.
cron.schedule("0 3 * * *", () => {
  runNightlyRescan().catch((err) => console.error("[Rescan] Failed:", err.message));
});

// ── Start ──────────────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Library Checker backend running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  for (const w of configWarnings()) console.warn(`[Config] ${w}`);
});

export default app;
