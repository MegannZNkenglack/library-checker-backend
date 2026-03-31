// src/auth.js
// JWT creation and verification helpers.

import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production"
);

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
  c.set("userId",    payload.sub);
  c.set("userEmail", payload.email);
  c.set("userTier",  payload.tier);
  await next();
}
