// src/routes/auth.js
// Email+password signup/login + Google OAuth.

import { Hono }   from "hono";
import bcrypt      from "bcryptjs";
import db          from "../db.js";
import { createToken, requireAuth } from "../auth.js";

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

// ── POST /auth/signup ─────────────────────────────────────────────────────────

router.post("/signup", async (c) => {
  const { email, password, name } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    return c.json({ error: "An account with this email already exists" }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name)
    VALUES (?, ?, ?)
  `).run(email.toLowerCase(), passwordHash, name || null);

  const user  = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  const token = await createToken({ sub: String(user.id), email: user.email });

  return c.json({ token, user: safeUser(user) }, 201);
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

  const token = await createToken({ sub: String(user.id), email: user.email });
  return c.json({ token, user: safeUser(user) });
});

// ── GET /auth/google ──────────────────────────────────────────────────────────
// Step 1: redirect the browser to Google's OAuth consent screen.

router.get("/google", (c) => {
  const params = new URLSearchParams({
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
      db.prepare("UPDATE users SET google_id = ?, name = ?, updated_at = datetime('now') WHERE id = ?")
        .run(profile.id, user.name || profile.name, user.id);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    } else {
      // Create new account
      const result = db.prepare(`
        INSERT INTO users (email, google_id, name)
        VALUES (?, ?, ?)
      `).run(profile.email.toLowerCase(), profile.id, profile.name || null);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    }
  }

  const jwt = await createToken({ sub: String(user.id), email: user.email });

  // Redirect back to the extension using a custom protocol.
  // The extension listens for this in the background service worker.
  // Format: https://your-backend.railway.app/auth/google/callback#token=JWT
  // The extension popup's launchWebAuthFlow will capture the redirect URL.
  const extensionCallbackUrl = `https://${process.env.EXTENSION_ID}.chromiumapp.org/oauth#token=${jwt}`;
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
