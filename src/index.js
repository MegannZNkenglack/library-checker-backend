// src/index.js
// Library Checker backend — Hono + Node.js

import "dotenv/config";
import { serve }   from "@hono/node-server";
import { Hono }    from "hono";
import { cors }    from "hono/cors";
import { logger }  from "hono/logger";

import cron from "node-cron";

import { requireAuth }     from "./auth.js";
import authRouter          from "./routes/auth.js";
import checkRouter         from "./routes/check.js";
import billingRouter       from "./routes/billing.js";
import { runNightlyRescan } from "./rescan.js";
import site, { NOT_FOUND_HTML, htmlHeaders } from "./site/index.js";
import librariesRouter from "./routes/libraries.js";

const app  = new Hono();
const PORT = parseInt(process.env.PORT || "3000");

// ── CORS ───────────────────────────────────────────────────────────────────────
// Allow requests from the Chrome extension and your landing page.
// Chrome extensions use chrome-extension://EXTENSION_ID as their origin.

const allowedOrigins = [
  `chrome-extension://${process.env.EXTENSION_ID}`,
  "http://localhost:3000",
  "http://localhost:5173",
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
];

app.use("*", cors({
  origin: (origin) => allowedOrigins.includes(origin) ? origin : null,
  allowMethods:  ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders:  ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge:        600,
}));

// ── Logging ────────────────────────────────────────────────────────────────────
app.use("*", logger());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok" }));

// ── Public website ────────────────────────────────────────────────────────────
// Home, pricing, libraries, help, FAQ, what's new, contact, privacy, terms and
// the Stripe checkout result pages (/billing/success, /billing/cancel — point
// STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL at them). See src/site/.
app.route("/", site);

// Public library search (name -> library) used by the extension's Settings tab.
app.route("/libraries", librariesRouter);

// ── Auth routes (no auth required) ────────────────────────────────────────────
app.route("/auth", authRouter);

// ── Protected routes ───────────────────────────────────────────────────────────
// requireAuth runs first, then passes to the route handler.
app.use("/check/*", requireAuth);

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
app.onError((err, c) => {
  console.error("[Error]", err.message);
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
});

export default app;
