// src/alerts.js
// "A book you're watching is now available" notices for the extension.
//
// The nightly rescan (rescan.js) already emails premium users when a watched
// shelf book frees up. It also records each one here so the extension can show
// a badge / desktop notification the same day instead of waiting for them to
// read their email. The extension asks for the unseen ones (GET /check/alerts)
// and marks them seen once the user has looked.

import db from "./db.js";

const LIST_LIMIT = 50;
const KEEP_DAYS  = 60;

// Same shape the availability email is built from:
// { title, author, libraryName, physical, searchUrl, digital: ["eBook", ...], digitalUrl }
export function recordAlerts(userId, items) {
  const insert = db.prepare(`
    INSERT INTO watch_alerts (user_id, title, author, library_name, kind, formats, url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const it of items) {
    const digital = Array.isArray(it.digital) ? it.digital : [];
    const kind    = it.physical && digital.length ? "both" : it.physical ? "print" : "digital";
    // Where a click should go: the catalog page for print, the OverDrive page for digital.
    const url     = it.physical ? (it.searchUrl || it.digitalUrl) : (it.digitalUrl || it.searchUrl);
    insert.run(userId, it.title, it.author || null, it.libraryName || null, kind, digital.join(","), url || null);
  }
}

// Unseen alerts, newest first.
export function listUnseenAlerts(userId) {
  return db.prepare(`
    SELECT id, title, author, library_name AS libraryName, kind, formats, url, created_at AS createdAt
    FROM watch_alerts
    WHERE user_id = ? AND seen_at IS NULL
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, LIST_LIMIT).map(a => ({ ...a, formats: a.formats ? a.formats.split(",") : [] }));
}

// Marks the given ids (or all of the user's alerts when none are given) as seen.
// Another user's ids are ignored because every update is scoped to userId.
export function markAlertsSeen(userId, ids) {
  if (Array.isArray(ids) && ids.length) {
    const mark = db.prepare("UPDATE watch_alerts SET seen_at = datetime('now') WHERE user_id = ? AND id = ? AND seen_at IS NULL");
    let n = 0;
    for (const id of ids.slice(0, 200)) {
      const num = Number(id);
      if (Number.isInteger(num)) n += mark.run(userId, num).changes;
    }
    return n;
  }
  return db.prepare("UPDATE watch_alerts SET seen_at = datetime('now') WHERE user_id = ? AND seen_at IS NULL").run(userId).changes;
}

// Old alerts are of no use to anyone.
export function pruneAlerts() {
  return db.prepare("DELETE FROM watch_alerts WHERE created_at < datetime('now', ?)").run(`-${KEEP_DAYS} days`).changes;
}
