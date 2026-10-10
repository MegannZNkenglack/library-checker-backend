// src/rescan.js
// Nightly job: re-checks every premium user's watched shelf books and
// emails them when something newly becomes available — in print or as an
// eBook/audiobook. Free users don't get this — shelf_watches is only ever
// written for premium accounts (see routes/check.js's /batch handler).

import db from "./db.js";
import { checkLibrary } from "./routes/check.js";
import { digitalState, availableDigitalFormats } from "./overdrive.js";
import { sendAvailabilityEmail } from "./email.js";

// What's newly available for one watched book, or null if there's nothing to
// email about. A digital alert needs an explicit "waiting" -> "available"
// change: a book whose digital state was never recorded (rows from before this
// feature, or titles not in the digital catalog) just has it recorded quietly,
// otherwise every existing watch would trigger an email on the first night.
export function describeImprovement(watch, result) {
  const physical =
    (result.status === "in_catalog" && watch.last_status !== "in_catalog") ||
    (result.status === "in_catalog" && result.availability === "available" && watch.last_availability !== "available");

  const digital = digitalState(result.digital) === "available" && watch.last_digital === "waiting"
    ? availableDigitalFormats(result.digital)
    : [];

  if (!physical && !digital.length) return null;
  return { physical, digital };
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
          pageFormat: "UNKNOWN", libraryUrl: w.library_url, libraryName: w.library_name,
        });
      } catch {
        continue; // leave last_status as-is, try again next night
      }
      totalChecked++;

      const improvement = describeImprovement(w, result);
      if (improvement) {
        newlyAvailable.push({
          title: w.title, author: w.author, libraryName: w.library_name,
          physical:   improvement.physical,
          searchUrl:  result.searchUrl,
          digital:    improvement.digital,
          digitalUrl: result.digital?.ebook?.available ? result.digital.ebook.overdriveUrl
                    : result.digital?.audiobook?.available ? result.digital.audiobook.overdriveUrl
                    : undefined,
        });
      }

      // A failed or empty digital lookup comes back as "no digital" — don't let
      // that wipe out a remembered "waiting", or the later "available" alert
      // would be missed.
      const newDigital = digitalState(result.digital) ?? w.last_digital ?? null;

      db.prepare(`
        UPDATE shelf_watches
        SET last_status = ?, last_availability = ?, last_digital = ?, last_checked_at = datetime('now')
        WHERE id = ?
      `).run(result.status, result.availability || null, newDigital, w.id);
    }

    if (newlyAvailable.length) {
      await sendAvailabilityEmail(user.email, newlyAvailable);
      totalNotified++;
    }
  }

  console.log(`[Rescan] Done — rechecked ${totalChecked} book(s), notified ${totalNotified} user(s).`);
}
