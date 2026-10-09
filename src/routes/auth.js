// src/routes/auth.js
// Email+password signup/login + Google OAuth.

import { Hono }   from "hono";
import bcrypt      from "bcryptjs";
import db          from "../db.js";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { createToken, requireAuth } from "../auth.js";
import { sendVerificationEmail, sendPasswordResetEmail, emailConfigured } from "../email.js";

const router = new Hono();

// ── Helper: build safe user response ─────────────────────────────────────────

function safeUser(user) {
  return {
    id:    user.id,
    email: user.email,
    name:  user.name,
    tier:  user.tier,
    subscriptionStatus: user.subscription_status,
  };
}

// Practical email format check — not full RFC 5322 (which is notoriously
// permissive/complex), just enough to catch the obvious cases: something,
// an @, a domain, a dot, a TLD.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Email verification codes ─────────────────────────────────────────────────

const CODE_TTL_MS        = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS  = 5;

function hashCode(userId, code) {
  return createHmac("sha256", process.env.JWT_SECRET).update(userId + ":" + code).digest("hex");
}

// Creates a fresh code (replacing any previous one) and emails it.
// Returns false if skipped because a code was sent within the cooldown window.
// `table` is only ever one of two internal constants, never user input.
async function issueCode(table, user, send) {
  const now  = Date.now();
  const prev = db.prepare(`SELECT last_sent_at FROM ${table} WHERE user_id = ?`).get(user.id);
  if (prev && now - prev.last_sent_at < RESEND_COOLDOWN_MS) return false;

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  db.prepare(`
    INSERT INTO ${table} (user_id, code_hash, expires_at, attempts, last_sent_at)
    VALUES (?, ?, ?, 0, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      code_hash = excluded.code_hash, expires_at = excluded.expires_at,
      attempts = 0, last_sent_at = excluded.last_sent_at
  `).run(user.id, hashCode(user.id, code), now + CODE_TTL_MS, now);

  await send(user.email, code);
  return true;
}

const issueVerificationCode = (user) => issueCode("email_verifications", user, sendVerificationEmail);
const issueResetCode        = (user) => issueCode("password_resets",     user, sendPasswordResetEmail);

function verificationRequiredResponse(c, email, status) {
  return c.json({ verificationRequired: true, email, message: "Check your email for a 6-digit verification code." }, status);
}

// ── POST /auth/signup ─────────────────────────────────────────────────────────

// Email verification at signup is switched on with REQUIRE_EMAIL_VERIFICATION=true.
// It stays off until the extension version that has the code-entry screen is
// live in the Chrome Web Store — older versions expect a login token straight
// back from signup and would silently fail. Forgot-password and the
// verify/resend endpoints work regardless of this setting.
const verificationRequired = () => process.env.REQUIRE_EMAIL_VERIFICATION === "true";

router.post("/signup", async (c) => {
  const { email, password, name } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    return c.json({ error: "Please enter a valid email address" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  if (verificationRequired() && !emailConfigured() && process.env.NODE_ENV === "production") {
    return c.json({ error: "Sign-up is temporarily unavailable. Please try again later." }, 503);
  }

  const normalised   = email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  const existing     = db.prepare("SELECT * FROM users WHERE email = ?").get(normalised);

  let user;
  if (existing && existing.email_verified) {
    return c.json({ error: "An account with this email already exists" }, 409);
  } else if (existing) {
    // Never-verified signup being retried: whoever proves control of the inbox
    // owns the account, so the latest password/name win.
    db.prepare("UPDATE users SET password_hash = ?, name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(passwordHash, name || existing.name, existing.id);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
  } else {
    const result = db.prepare("INSERT INTO users (email, password_hash, name, email_verified) VALUES (?, ?, ?, ?)")
      .run(normalised, passwordHash, name || null, verificationRequired() ? 0 : 1);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  }

  if (verificationRequired() || !user.email_verified) {
    await issueVerificationCode(user);
    return verificationRequiredResponse(c, user.email, 201);
  }

  const token = await createToken({ sub: String(user.id), email: user.email });
  return c.json({ token, user: safeUser(user) }, 201);
});

// ── POST /auth/verify ─────────────────────────────────────────────────────────

router.post("/verify", async (c) => {
  const { email, code } = await c.req.json();
  if (!email || !code) return c.json({ error: "Email and code are required" }, 400);

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase());
  const rec  = user && db.prepare("SELECT * FROM email_verifications WHERE user_id = ?").get(user.id);

  if (user?.email_verified) {
    return c.json({ error: "This email is already verified. Please sign in." }, 400);
  }
  if (!user || !rec) {
    return c.json({ error: "Invalid or expired code. Request a new one." }, 400);
  }
  if (Date.now() > rec.expires_at) {
    return c.json({ error: "That code has expired. Request a new one." }, 400);
  }
  if (rec.attempts >= MAX_CODE_ATTEMPTS) {
    return c.json({ error: "Too many incorrect attempts. Request a new code." }, 429);
  }

  const given    = Buffer.from(hashCode(user.id, String(code).trim()));
  const expected = Buffer.from(rec.code_hash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    db.prepare("UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = ?").run(user.id);
    return c.json({ error: "Incorrect code. Please try again." }, 400);
  }

  db.prepare("UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?").run(user.id);
  db.prepare("DELETE FROM email_verifications WHERE user_id = ?").run(user.id);

  const verified = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  const token    = await createToken({ sub: String(verified.id), email: verified.email });
  return c.json({ token, user: safeUser(verified) });
});

// ── POST /auth/resend ─────────────────────────────────────────────────────────
// Always answers 200 so it can't be used to discover which emails have accounts.

router.post("/resend", async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ error: "Email is required" }, 400);

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase());
  if (user && !user.email_verified) await issueVerificationCode(user);
  return c.json({ ok: true });
});

// ── POST /auth/forgot ─────────────────────────────────────────────────────────
// Always answers 200 so it can't be used to discover which emails have accounts.
// Only verified accounts get a reset code (an unverified signup can simply sign up again).

router.post("/forgot", async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ error: "Email is required" }, 400);

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase());
  if (user && user.email_verified) await issueResetCode(user);
  return c.json({ ok: true });
});

// ── POST /auth/reset ──────────────────────────────────────────────────────────

router.post("/reset", async (c) => {
  const { email, code, newPassword } = await c.req.json();
  if (!email || !code || !newPassword) {
    return c.json({ error: "Email, code and new password are required" }, 400);
  }
  if (newPassword.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase());
  const rec  = user && db.prepare("SELECT * FROM password_resets WHERE user_id = ?").get(user.id);

  if (!user || !rec) {
    return c.json({ error: "Invalid or expired code. Request a new one." }, 400);
  }
  if (Date.now() > rec.expires_at) {
    return c.json({ error: "That code has expired. Request a new one." }, 400);
  }
  if (rec.attempts >= MAX_CODE_ATTEMPTS) {
    return c.json({ error: "Too many incorrect attempts. Request a new code." }, 429);
  }

  const given    = Buffer.from(hashCode(user.id, String(code).trim()));
  const expected = Buffer.from(rec.code_hash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    db.prepare("UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?").run(user.id);
    return c.json({ error: "Incorrect code. Please try again." }, 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ?, email_verified = 1, updated_at = datetime('now') WHERE id = ?")
    .run(passwordHash, user.id);
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  const token   = await createToken({ sub: String(updated.id), email: updated.email });
  return c.json({ token, user: safeUser(updated) });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
  if (!user || !user.password_hash) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (!user.email_verified) {
    await issueVerificationCode(user);
    return verificationRequiredResponse(c, user.email, 403);
  }

  const token = await createToken({ sub: String(user.id), email: user.email });
  return c.json({ token, user: safeUser(user) });
});

// ── GET /auth/google ──────────────────────────────────────────────────────────
// Step 1: redirect the browser to Google's OAuth consent screen.

// The extension that started a sign-in (published or dev build) is the one the
// token must be returned to, so its ID travels through Google in "state". Only
// IDs we already trust (EXTENSION_ID + the chrome-extension:// entries in
// ALLOWED_ORIGINS) are honoured, so this can't be used as an open redirect.
function allowedExtensionIds() {
  const ids = new Set();
  if (process.env.EXTENSION_ID) ids.add(process.env.EXTENSION_ID);
  for (const origin of (process.env.ALLOWED_ORIGINS || "").split(",")) {
    const m = origin.trim().match(/^chrome-extension:\/\/([a-p]{32})$/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

// "https://<id>.chromiumapp.org/oauth" -> "<id>" when trusted, otherwise null.
function trustedExtensionId(redirectUrl) {
  try {
    const m = new URL(redirectUrl).hostname.match(/^([a-p]{32})\.chromiumapp\.org$/);
    return m && allowedExtensionIds().has(m[1]) ? m[1] : null;
  } catch { return null; }
}

router.get("/google", (c) => {
  const extensionId = trustedExtensionId(c.req.query("extension_redirect")) || process.env.EXTENSION_ID;
  const params = new URLSearchParams({
    state:         extensionId,
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope:         "openid email profile",
    access_type:   "offline",
    prompt:        "consent",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ── GET /auth/google/callback ─────────────────────────────────────────────────
// Step 2: Google redirects here with a ?code=... param.
// We exchange the code for tokens, look up/create the user, and redirect
// back to the extension with a JWT in the URL fragment.

router.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.json({ error: "Missing OAuth code" }, 400);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
      grant_type:    "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return c.json({ error: "Failed to exchange code for token" }, 400);
  }

  // Fetch user profile from Google
  const profileRes  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();

  if (!profile.id || !profile.email) {
    return c.json({ error: "Could not retrieve Google profile" }, 400);
  }

  // Find or create user
  let user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(profile.id);

  if (!user) {
    // Check if they already have an email account
    user = db.prepare("SELECT * FROM users WHERE email = ?").get(profile.email.toLowerCase());
    if (user) {
      // Link Google to existing account
      // Google has verified this inbox. If the existing account was never
      // verified, drop its password — it may have been set by someone else.
      db.prepare("UPDATE users SET google_id = ?, name = ?, email_verified = 1, " +
        "password_hash = CASE WHEN email_verified = 0 THEN NULL ELSE password_hash END, " +
        "updated_at = datetime('now') WHERE id = ?")
        .run(profile.id, user.name || profile.name, user.id);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    } else {
      // Create new account
      const result = db.prepare(`
        INSERT INTO users (email, google_id, name, email_verified)
        VALUES (?, ?, ?, 1)
      `).run(profile.email.toLowerCase(), profile.id, profile.name || null);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    }
  }

  const jwt = await createToken({ sub: String(user.id), email: user.email });

  // Redirect back to the extension using a custom protocol.
  // The extension listens for this in the background service worker.
  // Format: https://your-backend.railway.app/auth/google/callback#token=JWT
  // The extension popup's launchWebAuthFlow will capture the redirect URL.
  const stateId = c.req.query("state");
  const returnId = stateId && allowedExtensionIds().has(stateId) ? stateId : process.env.EXTENSION_ID;
  const extensionCallbackUrl = `https://${returnId}.chromiumapp.org/oauth#token=${jwt}`;
  return c.redirect(extensionCallbackUrl);
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (c) => {
  // requireAuth already loaded the user and put its id on context
  const userId = c.get("userId");
  const user   = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ user: safeUser(user) });
});

export default router;
