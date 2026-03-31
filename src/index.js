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

// ── Auth routes (no auth required) ────────────────────────────────────────────
app.route("/auth", authRouter);

// ── Protected routes ───────────────────────────────────────────────────────────
// requireAuth runs first, then passes to the route handler.
app.use("/check/*",   requireAuth);
app.use("/billing/*", requireAuth);

// Webhook is exempt from auth (Stripe signs it differently)
// Mount it BEFORE the protected billing middleware catches it
app.post("/billing/webhook", async (c) => {
  // Temporarily bypass requireAuth for the webhook — re-export from billing router
  const { default: billing } = await import("./routes/billing.js");
  return billing.fetch(c.req.raw, c.env);
});

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
