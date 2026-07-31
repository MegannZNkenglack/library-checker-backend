// src/index.js
// Library Checker backend — Hono + Node.js

import "dotenv/config";
import { serve }   from "@hono/node-server";
import { Hono }    from "hono";
import { cors }    from "hono/cors";
import { logger }  from "hono/logger";

import { requireAuth } from "./auth.js";
import authRouter      from "./routes/auth.js";
import checkRouter     from "./routes/check.js";
import billingRouter   from "./routes/billing.js";

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

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/", (c) => c.json({ status: "ok", version: "1.0.0" }));
app.get("/health", (c) => c.json({ status: "ok" }));

// ── Stripe checkout redirect targets ─────────────────────────────────────────
// Served directly so STRIPE_SUCCESS_URL/CANCEL_URL don't require a separate
// landing-page host. Point them at <your-backend-url>/billing/success and
// /billing/cancel once deployed.

app.get("/billing/success", (c) => c.html(`<!doctype html>
<html><head><title>Subscribed — Library Checker</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem;color:#222}</style>
</head><body>
<h1>You're all set</h1>
<p>Your subscription is active. You can close this tab and return to the Library Checker extension.</p>
</body></html>`));

app.get("/billing/cancel", (c) => c.html(`<!doctype html>
<html><head><title>Checkout cancelled — Library Checker</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem;color:#222}</style>
</head><body>
<h1>Checkout cancelled</h1>
<p>No changes were made. You can close this tab and try again anytime from the extension.</p>
</body></html>`));

// ── Privacy policy ────────────────────────────────────────────────────────────
// Required by the Chrome Web Store listing and the Google OAuth consent screen.
// TODO: replace "Library Checker" contact line with a real support address
// before publishing, and update this if the data collected changes.

app.get("/privacy", (c) => c.html(`<!doctype html>
<html><head><title>Privacy Policy — Library Checker</title>
<style>
body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1.5rem;color:#222;line-height:1.6}
h1{margin-bottom:0.25rem} h2{margin-top:2rem}
</style></head><body>
<h1>Library Checker — Privacy Policy</h1>
<p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>

<h2>What we collect</h2>
<ul>
<li><strong>Account info:</strong> your email address, and if you sign in with Google, your Google account ID and name.</li>
<li><strong>Book checks:</strong> the ISBN, title, author, and format of books you check, plus the library you selected and the result — stored as your check history.</li>
<li><strong>Billing:</strong> subscription status and payment method are handled entirely by Stripe. We store your Stripe customer/subscription ID, not your card details.</li>
</ul>

<h2>How we use it</h2>
<p>To operate your account (sign-in, daily usage limits, subscription tier) and to show your check history back to you in the extension. We do not sell your data or share it with advertisers.</p>

<h2>Third parties</h2>
<p>Book availability lookups are sent to your chosen library's catalog (BiblioCommons) and to NoveList/EBSCO. Sign-in and billing are handled by Google and Stripe respectively, under their own privacy policies.</p>

<h2>Data retention & deletion</h2>
<p>Check history and account data are kept while your account is active. To delete your account and all associated data, contact us at the address below.</p>

<h2>Security</h2>
<p>Passwords are hashed with bcrypt and never stored in plain text. All traffic to our backend is encrypted with HTTPS.</p>

<h2>Contact</h2>
<p>Questions about this policy or your data: <a href="mailto:${process.env.SUPPORT_EMAIL || "support@example.com"}">${process.env.SUPPORT_EMAIL || "support@example.com"}</a></p>
</body></html>`));

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
app.notFound((c) => c.json({ error: "Not found" }, 404));

// ── Error handler ──────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("[Error]", err.message);
  return c.json({ error: "Internal server error" }, 500);
});

// ── Start ──────────────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Library Checker backend running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
