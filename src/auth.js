// src/auth.js
// JWT creation and verification helpers.

import { SignJWT, jwtVerify } from "jose";
import db from "./db.js";

// No insecure fallback here on purpose: signing tokens with a hardcoded
// default would mean anyone who reads this file (it's public on GitHub)
// could forge a valid JWT for any user ID. Fail fast instead.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set — refusing to start.");
}
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const ALGORITHM = "HS256";
const EXPIRES_IN = "30d";

// ── Create a token ─────────────────────────────────────────────────────────────

export async function createToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secret);
}

// ── Verify a token ─────────────────────────────────────────────────────────────

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

// ── Middleware: require a valid Bearer token ────────────────────────────────────
// Tier is looked up fresh from the DB on every request rather than trusted from
// the JWT payload — tokens live for 30 days, so a stale claim would mean a user
// who just upgraded (or cancelled) doesn't see the change take effect for weeks.

export async function requireAuth(c, next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorised" }, 401);
  }
  const token   = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  const user = db.prepare("SELECT id, email, tier FROM users WHERE id = ?").get(payload.sub);
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  c.set("userId",    user.id);
  c.set("userEmail", user.email);
  c.set("userTier",  user.tier);
  await next();
}
