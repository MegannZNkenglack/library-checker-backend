// src/email.js
// Sends the "newly available" notification email via Resend for the
// nightly shelf-rescan job. If RESEND_API_KEY isn't set, this logs and
// skips instead of crashing — lets the rest of the app run fine without it
// during local dev or before the key's been added.

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendAvailabilityEmail(toEmail, newlyAvailable) {
  if (!newlyAvailable.length) return;

  if (!resend) {
    console.log(`[Email] RESEND_API_KEY not set — would have notified ${toEmail} about ${newlyAvailable.length} book(s)`);
    return;
  }

  const items = newlyAvailable.map(b => `
    <li style="margin-bottom:8px;">
      <strong>${escapeHtml(b.title)}</strong>${b.author ? ` by ${escapeHtml(b.author)}` : ""}
      ${b.searchUrl ? ` — <a href="${b.searchUrl}">view at ${escapeHtml(b.libraryName || "your library")}</a>` : ""}
    </li>`).join("");

  try {
    await resend.emails.send({
      from:    process.env.NOTIFY_FROM_EMAIL || "onboarding@resend.dev",
      to:      toEmail,
      subject: `${newlyAvailable.length} book${newlyAvailable.length !== 1 ? "s" : ""} from your shelf ${newlyAvailable.length !== 1 ? "are" : "is"} now available`,
      html: `
        <p>Good news — these books from your Goodreads shelf are now available at your library:</p>
        <ul>${items}</ul>
        <p style="color:#888;font-size:12px;">You're getting this because you're a Library Checker Premium subscriber with shelf monitoring enabled.</p>
      `,
    });
  } catch (err) {
    console.error(`[Email] Failed to send to ${toEmail}:`, err.message);
  }
}
