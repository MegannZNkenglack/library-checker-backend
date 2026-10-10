// src/events.js
// Records the moments a free user runs into a limit, so the (private) stats page
// can show how many people hit each limit and how many of them went on to upgrade.
// Only the user id, the kind of limit and the time are stored — no book or
// library details.

import db from "./db.js";

export const LIMIT_KINDS = {
  check_quota: "Used all daily book checks",
  scan_quota:  "Tried a second shelf scan in a day",
  scan_cap:    "Scanned a shelf longer than the free 10-book limit",
  library_cap: "Selected more libraries than the free limit",
};

const insert = db.prepare("INSERT INTO limit_events (user_id, kind) VALUES (?, ?)");

// Never lets a logging problem break the request that triggered it.
export function recordLimitEvent(userId, kind) {
  if (!LIMIT_KINDS[kind]) return;
  try { insert.run(userId, kind); } catch (err) { console.error("[Events] couldn't record", kind, err.message); }
}
