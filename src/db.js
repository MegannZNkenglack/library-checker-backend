// src/db.js
// SQLite database setup using better-sqlite3.
// Run "node src/db.js" once to initialise the schema.

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = process.env.DB_PATH || join(__dirname, "../data/library_checker.db");

// Ensure the data directory exists
import { mkdirSync } from "fs";
mkdirSync(join(__dirname, "../data"), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ─────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    NOT NULL UNIQUE,
    password_hash   TEXT,                        -- null for Google-only accounts
    google_id       TEXT    UNIQUE,              -- null for email-only accounts
    name            TEXT,
    tier            TEXT    NOT NULL DEFAULT 'free',   -- 'free' | 'premium'
    stripe_customer_id    TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    subscription_status   TEXT DEFAULT 'inactive',    -- 'active' | 'inactive' | 'cancelled'
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,                 -- ISO date: "2026-03-25"
    count      INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS check_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    isbn         TEXT,
    title        TEXT,
    library_url  TEXT,
    library_name TEXT,
    status       TEXT,                           -- in_catalog | not_found | no_exact_edition
    search_url   TEXT,
    checked_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shelf_scans (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,                 -- ISO date: "2026-03-25"
    count      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );

  -- Remembers the last known status of each book a premium user has
  -- scanned, so a nightly job can re-check and notify on changes without
  -- needing their browser open. Only written for premium users — the
  -- free tier's manual scan doesn't get ongoing monitoring.
  CREATE TABLE IF NOT EXISTS shelf_watches (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    library_url      TEXT    NOT NULL,
    library_name     TEXT,
    title            TEXT    NOT NULL,
    author           TEXT,
    isbn             TEXT,
    last_status      TEXT,                        -- in_catalog | no_exact_edition | not_found | error
    last_availability TEXT,                        -- available | on_hold | null
    last_checked_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, library_url, title, author)
  );

  CREATE INDEX IF NOT EXISTS idx_usage_user_date    ON usage(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_shelf_watches_user  ON shelf_watches(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_user       ON check_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_google       ON users(google_id);
  CREATE INDEX IF NOT EXISTS idx_users_stripe_cust  ON users(stripe_customer_id);
`);

console.log("Database initialised at:", DB_PATH);

export default db;
