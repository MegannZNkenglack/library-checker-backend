// src/rescan.js
// Nightly job: re-checks every premium user's watched shelf books and
// emails them when something newly becomes available. Free users don't
// get this — shelf_watches is only ever written for premium accounts
// (see routes/check.js's /batch handler).

import db from "./db.js";
import { checkLibrary } from "./routes/check.js";
import { sendAvailabilityEmail } from "./email.js";

function statusImproved(oldStatus, oldAvailability, newStatus, newAvailability) {
  if (newStatus === "in_catalog" && oldStatus !== "in_catalog") return true;
  if (newStatus === "in_catalog" && newAvailability === "available" && oldAvailability !== "available") return true;
  return false;
}

export async function runNightlyRescan() {
  console.log("[Rescan] Starting nightly rescan...");

  const users = db.prepare(`
    SELECT DISTINCT u.id, u.email
    FROM shelf_watches w
    JOIN users u ON u.id = w.user_id
    WHERE u.tier = 'premium' AND u.subscription_status = 'active'
  `).all();

  let totalChecked = 0, totalNotified = 0;

  for (const user of users) {
    const watches = db.prepare("SELECT * FROM shelf_watches WHERE user_id = ?").all(user.id);
    const newlyAvailable = [];

    for (const w of watches) {
      // Already known available — nothing to gain from re-checking.
      if (w.last_status === "in_catalog" && w.last_availability === "available") continue;

      let result;
      try {
        result = await checkLibrary({
          isbn: w.isbn, title: w.title, author: w.author,
          pageFormat: "UNKNOWN", libraryUrl: w.library_url,
        });
      } catch {
        continue; // leave last_status as-is, try again next night
      }
      totalChecked++;

      if (statusImproved(w.last_status, w.last_availability, result.status, result.availability)) {
        newlyAvailable.push({
          title: w.title, author: w.author, libraryName: w.library_name,
          searchUrl: result.searchUrl,
        });
      }

      db.prepare(`
        UPDATE shelf_watches
        SET last_status = ?, last_availability = ?, last_checked_at = datetime('now')
        WHERE id = ?
      `).run(result.status, result.availability || null, w.id);
    }

    if (newlyAvailable.length) {
      await sendAvailabilityEmail(user.email, newlyAvailable);
      totalNotified++;
    }
  }

  console.log(`[Rescan] Done — rechecked ${totalChecked} book(s), notified ${totalNotified} user(s).`);
}
