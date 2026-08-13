// src/index.js
// Library Checker backend — Hono + Node.js

import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { serve }   from "@hono/node-server";
import { Hono }    from "hono";
import { cors }    from "hono/cors";
import { logger }  from "hono/logger";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const landingHtml = readFileSync(join(__dirname, "landing.html"), "utf8");

import cron from "node-cron";

import { requireAuth }     from "./auth.js";
import authRouter          from "./routes/auth.js";
import checkRouter         from "./routes/check.js";
import billingRouter       from "./routes/billing.js";
import { runNightlyRescan } from "./rescan.js";

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

// ── Landing page / health check ──────────────────────────────────────────────
app.get("/", (c) => c.html(landingHtml));
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

// ── Terms of service ──────────────────────────────────────────────────────────
// Required by the Google OAuth consent screen and good practice for a paid
// subscription product. This is a plain-language starting point, not a
// substitute for review by an actual lawyer — the governing-law line in
// particular is a placeholder until you confirm your own jurisdiction.

app.get("/terms", (c) => c.html(`<!doctype html>
<html><head><title>Terms of Service — Library Checker</title>
<style>
body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1.5rem;color:#222;line-height:1.6}
h1{margin-bottom:0.25rem} h2{margin-top:2rem}
</style></head><body>
<h1>Library Checker — Terms of Service</h1>
<p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>

<h2>The service</h2>
<p>Library Checker is a browser extension that checks whether a book you're viewing on Goodreads is available at a library you select. Availability data comes from third-party sources (your library's catalog and NoveList/EBSCO) and may occasionally be incomplete, outdated, or wrong — always confirm with your library before relying on it.</p>

<h2>Accounts</h2>
<p>You need an account (email/password or Google sign-in) to use the service. You're responsible for keeping your login credentials secure and for activity that happens under your account.</p>

<h2>Free and paid plans</h2>
<ul>
<li><strong>Free:</strong> a limited number of checks per day.</li>
<li><strong>Premium:</strong> a paid monthly subscription billed through Stripe, currently $5/month, for unlimited checks.</li>
</ul>
<p>You can cancel anytime from the extension's Account tab (via the Stripe billing portal). Cancelling stops future billing but doesn't refund the current period — you keep premium access until the end of the period you already paid for, then your account reverts to the free plan.</p>

<h2>Acceptable use</h2>
<p>Don't use the service to abuse, scrape at scale, or overload our backend or the libraries/catalogs it queries on your behalf. We may suspend accounts that do.</p>

<h2>No warranty</h2>
<p>The service is provided "as is." We don't guarantee it will be uninterrupted, error-free, or that availability results are always accurate, since we depend on third-party data we don't control.</p>

<h2>Limitation of liability</h2>
<p>To the extent permitted by law, Library Checker isn't liable for indirect, incidental, or consequential damages arising from your use of the service, including a wasted trip to the library for a book that turned out not to be available.</p>

<h2>Changes</h2>
<p>We may update these terms or the service itself over time. Material changes will be reflected here with an updated date.</p>

<h2>Governing law</h2>
<p>These terms are governed by the laws of Ontario, Canada.</p>

<h2>Contact</h2>
<p>Questions about these terms: <a href="mailto:${process.env.SUPPORT_EMAIL || "support@example.com"}">${process.env.SUPPORT_EMAIL || "support@example.com"}</a></p>
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

// ── TEMPORARY: one-time test of the real nightly rescan + email flow ────────
// Seeds a "not yet available" watch for a known book on the given premium
// account, immediately "fixes" it to look newly-available, then runs the
// real rescan job — so a real email either does or doesn't land, instead of
// waiting for the 3am cron. Remove this route right after use.

app.post("/admin/test-rescan", async (c) => {
  if (c.req.header("X-Test-Secret") !== "b99692810ab2a9fe746e55a705e4734e707f37aad42d22fb") {
    return c.json({ error: "Unauthorised" }, 401);
  }

  const { email } = await c.req.json();
  const { default: db } = await import("./db.js");

  const user = db.prepare("SELECT id, tier FROM users WHERE email = ?").get(email);
  if (!user) return c.json({ error: "No user with that email" }, 404);
  if (user.tier !== "premium") return c.json({ error: "User is not premium — rescan only watches premium accounts" }, 400);

  const libraryUrl  = "https://hpl.bibliocommons.com";
  const libraryName = "Hamilton Public Library";

  db.prepare(`
    INSERT INTO shelf_watches (user_id, library_url, library_name, title, author, isbn, last_status, last_availability, last_checked_at)
    VALUES (?, ?, ?, 'Red Rising', 'Pierce Brown', '0000000000000', 'not_found', NULL, datetime('now'))
    ON CONFLICT (user_id, library_url, title, author) DO UPDATE SET
      isbn = '0000000000000', last_status = 'not_found', last_availability = NULL
  `).run(user.id, libraryUrl, libraryName);

  // "Fix" the ISBN to the real one — simulates the book becoming available
  // between last night's check and tonight's, without waiting for a real
  // catalog change.
  db.prepare(`
    UPDATE shelf_watches SET isbn = '9780345539809'
    WHERE user_id = ? AND library_url = ? AND title = 'Red Rising'
  `).run(user.id, libraryUrl);

  const { runNightlyRescan } = await import("./rescan.js");
  await runNightlyRescan();

  return c.json({ ok: true, message: "Rescan ran — check the Render logs and your inbox." });
});

// ── 404 handler ────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: "Not found" }, 404));

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
