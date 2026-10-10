// src/history.js
// Searching and exporting a user's check history.

import db from "./db.js";

export const HISTORY_PAGE_DEFAULT = 50;
export const HISTORY_PAGE_MAX     = 200;
export const HISTORY_EXPORT_MAX   = 20000;

const STATUSES = new Set(["in_catalog", "no_exact_edition", "not_found", "digital_only", "error"]);

const RESULT_LABELS = {
  in_catalog:       "In catalog",
  no_exact_edition: "Other edition",
  not_found:        "Not in catalog",
  digital_only:     "Digital only",
  error:            "Couldn't check",
};
const AVAILABILITY_LABELS = {
  available: "Available now",
  on_hold:   "All copies out",
};

// Filters: q (title/author text), status (a result, or "available" for books
// that could be borrowed right now), library (a library URL).
function buildWhere(userId, { q, status, library } = {}) {
  const clauses = ["user_id = ?"];
  const params  = [userId];

  const text = String(q || "").trim().slice(0, 100);
  if (text) {
    // Escape LIKE wildcards so a search for "100%" or "a_b" matches literally.
    const like = "%" + text.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
    clauses.push("(title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }

  if (status === "available") {
    clauses.push("status = 'in_catalog' AND availability = 'available'");
  } else if (STATUSES.has(status)) {
    clauses.push("status = ?");
    params.push(status);
  }

  if (library) {
    clauses.push("library_url = ?");
    params.push(String(library));
  }

  return { where: clauses.join(" AND "), params };
}

const COLUMNS = "id, title, author, isbn, library_url, library_name, status, availability, search_url, checked_at";

export function searchHistory(userId, filters, limit, offset) {
  const { where, params } = buildWhere(userId, filters);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM check_history WHERE ${where}`).get(...params).n;
  const rows  = db.prepare(`
    SELECT ${COLUMNS} FROM check_history WHERE ${where}
    ORDER BY checked_at DESC, id DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  return { rows, total };
}

// Libraries the user has checked, for the filter dropdown.
export function historyLibraries(userId) {
  return db.prepare(`
    SELECT library_url AS url, MAX(library_name) AS name, COUNT(*) AS checks
    FROM check_history WHERE user_id = ? AND library_url IS NOT NULL
    GROUP BY library_url ORDER BY checks DESC
  `).all(userId);
}

export function exportRows(userId, filters) {
  const { where, params } = buildWhere(userId, filters);
  return db.prepare(`
    SELECT ${COLUMNS} FROM check_history WHERE ${where}
    ORDER BY checked_at DESC, id DESC LIMIT ?
  `).all(...params, HISTORY_EXPORT_MAX);
}

// SQLite stores "2026-10-09 14:30:25" (UTC) — make that an unambiguous ISO date.
const toIso = (s) => (s ? s.replace(" ", "T") + "Z" : "");

function friendly(row) {
  return {
    checkedAt:    toIso(row.checked_at),
    title:        row.title || "",
    author:       row.author || "",
    isbn:         row.isbn || "",
    library:      row.library_name || row.library_url || "",
    result:       RESULT_LABELS[row.status] || row.status || "",
    availability: AVAILABILITY_LABELS[row.availability] || "",
    link:         row.search_url || "",
  };
}

// A spreadsheet treats a cell starting with = + - @ as a formula, which is a
// known injection vector for exported data — prefix those with an apostrophe.
function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const CSV_HEADERS = [
  ["checkedAt", "Checked at (UTC)"], ["title", "Title"], ["author", "Author"], ["isbn", "ISBN"],
  ["library", "Library"], ["result", "Result"], ["availability", "Availability"], ["link", "Link"],
];

export function toCsv(rows) {
  const lines = [CSV_HEADERS.map(([, label]) => csvCell(label)).join(",")];
  for (const row of rows.map(friendly)) {
    lines.push(CSV_HEADERS.map(([key]) => csvCell(row[key])).join(","));
  }
  // BOM so Excel reads accented titles as UTF-8; CRLF is the CSV standard.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function toJson(rows) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, history: rows.map(friendly) }, null, 2);
}
