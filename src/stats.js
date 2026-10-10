// src/stats.js
// Aggregate numbers for the private /admin page. Everything here is a count —
// no email addresses, names or book titles ever leave this module.

import db from "./db.js";
import { LIMIT_KINDS } from "./events.js";

const DAYS = 30;

// ISO dates (UTC) for the last `n` days, oldest first — the same format as usage.date.
function lastDays(n, now = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() - (n - 1 - i) * 86400000);
    return d.toISOString().slice(0, 10);
  });
}

const one = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);

function series(days, rows, key) {
  const byDay = new Map(rows.map(r => [r.d, r[key]]));
  return days.map(d => ({ date: d, value: byDay.get(d) || 0 }));
}

export function computeStats(now = new Date()) {
  const days  = lastDays(DAYS, now);
  const since = days[0];

  // ── accounts ──
  const users = {
    total:      one("SELECT COUNT(*) n FROM users").n,
    verified:   one("SELECT COUNT(*) n FROM users WHERE email_verified = 1").n,
    premium:    one("SELECT COUNT(*) n FROM users WHERE tier = 'premium'").n,
    free:       one("SELECT COUNT(*) n FROM users WHERE tier != 'premium'").n,
    google:     one("SELECT COUNT(*) n FROM users WHERE google_id IS NOT NULL").n,
    everChecked: one("SELECT COUNT(DISTINCT user_id) n FROM usage").n,
    signups7:   one("SELECT COUNT(*) n FROM users WHERE date(created_at) >= ?", days[DAYS - 7]).n,
    signups30:  one("SELECT COUNT(*) n FROM users WHERE date(created_at) >= ?", since).n,
  };

  // ── activity ──
  const active = (from, to) => one(
    "SELECT COUNT(DISTINCT user_id) n FROM usage WHERE date >= ? AND date <= ?", from, to).n;
  const activity = {
    active7:        active(days[DAYS - 7], days[DAYS - 1]),
    activePrev7:    active(days[DAYS - 14], days[DAYS - 8]),
    checks7:        one("SELECT COALESCE(SUM(count),0) n FROM usage WHERE date >= ?", days[DAYS - 7]).n,
    checks30:       one("SELECT COALESCE(SUM(count),0) n FROM usage WHERE date >= ?", since).n,
    scans30:        one("SELECT COALESCE(SUM(count),0) n FROM shelf_scans WHERE date >= ?", since).n,
    freeScanners30: one(`SELECT COUNT(DISTINCT s.user_id) n FROM shelf_scans s JOIN users u ON u.id = s.user_id
                         WHERE s.date >= ? AND u.tier != 'premium'`, since).n,
    watches:        one("SELECT COUNT(*) n FROM shelf_watches").n,
    watchers:       one("SELECT COUNT(DISTINCT user_id) n FROM shelf_watches").n,
  };

  const daily = {
    signups: series(days, all("SELECT date(created_at) d, COUNT(*) v FROM users WHERE date(created_at) >= ? GROUP BY d", since), "v"),
    checks:  series(days, all("SELECT date d, SUM(count) v FROM usage WHERE date >= ? GROUP BY date", since), "v"),
    active:  series(days, all("SELECT date d, COUNT(DISTINCT user_id) v FROM usage WHERE date >= ? GROUP BY date", since), "v"),
    scans:   series(days, all("SELECT date d, SUM(count) v FROM shelf_scans WHERE date >= ? GROUP BY date", since), "v"),
  };

  // ── limits: who ran into each one, and did they upgrade? ──
  const limits = Object.entries(LIMIT_KINDS).map(([kind, label]) => {
    const window = (fromDay) => one(`
      SELECT COUNT(DISTINCT e.user_id) users, COUNT(*) events,
             COUNT(DISTINCT CASE WHEN u.tier = 'premium' THEN e.user_id END) upgraded
      FROM limit_events e JOIN users u ON u.id = e.user_id
      WHERE date(e.created_at) >= ? AND e.kind = ?`, fromDay, kind);
    return { kind, label, last7: window(days[DAYS - 7]), last30: window(since) };
  });

  // Users who hit the daily check limit on at least one day, from usage alone —
  // covers the time before limit events were recorded.
  const reachedCheckLimit30 = one(`
    SELECT COUNT(DISTINCT x.user_id) n FROM usage x JOIN users u ON u.id = x.user_id
    WHERE x.date >= ? AND x.count >= 5 AND u.tier != 'premium'`, since).n;

  // ── what people check ──
  const topLibraries = all(`
    SELECT COALESCE(MAX(library_name), library_url) name, COUNT(*) checks, COUNT(DISTINCT user_id) users,
           SUM(CASE WHEN library_url LIKE 'overdrive:%' THEN 1 ELSE 0 END) digital_only
    FROM check_history WHERE date(checked_at) >= ? AND library_url IS NOT NULL
    GROUP BY library_url ORDER BY checks DESC LIMIT 10`, since);

  const results = all(`
    SELECT COALESCE(status, 'unknown') status, COUNT(*) n FROM check_history
    WHERE date(checked_at) >= ? GROUP BY status ORDER BY n DESC`, since);

  const total7 = one("SELECT COUNT(*) n FROM check_history WHERE date(checked_at) >= ?", days[DAYS - 7]).n;
  const errors7 = one("SELECT COUNT(*) n FROM check_history WHERE date(checked_at) >= ? AND status = 'error'", days[DAYS - 7]).n;

  return {
    generatedAt: now.toISOString(),
    windowDays: DAYS,
    users, activity, daily, limits, reachedCheckLimit30,
    topLibraries, results,
    health: { lookups7: total7, errors7, errorRate7: total7 ? errors7 / total7 : 0 },
  };
}
