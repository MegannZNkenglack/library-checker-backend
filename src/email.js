// src/email.js
// Outgoing email: verification codes and "newly available" notifications.
//
// Transport is picked from env vars:
//   SMTP_USER + SMTP_PASS  -> SMTP via Nodemailer (defaults to Gmail; works for any recipient)
//   RESEND_API_KEY         -> Resend (only reaches arbitrary recipients once a domain is verified)
//   neither                -> log and skip, so local dev and CI never crash

import nodemailer from "nodemailer";
import { Resend } from "resend";

const smtp = (process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport({
      host:   process.env.SMTP_HOST || "smtp.gmail.com",
      port:   Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_SECURE ?? "true") !== "false",
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.NOTIFY_FROM_EMAIL
  || (smtp ? `Library Checker <${process.env.SMTP_USER}>` : "onboarding@resend.dev");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailConfigured() {
  return Boolean(smtp || resend);
}

// Returns true if the message was handed to a transport, false otherwise.
async function sendMail({ to, subject, html, replyTo }) {
  try {
    if (smtp) {
      await smtp.sendMail({ from: FROM, to, subject, html, ...(replyTo ? { replyTo } : {}) });
      return true;
    }
    if (resend) {
      const { error } = await resend.emails.send({ from: FROM, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) });
      if (error) throw new Error(error.message);
      return true;
    }
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err.message);
    return false;
  }
  console.log(`[Email] No email transport configured — would have sent "${subject}" to ${to}`);
  return false;
}

export async function sendVerificationEmail(toEmail, code) {
  // Local dev convenience only: with no transport, print the code so signup
  // can be tested end-to-end. Never logged in production.
  if (!emailConfigured() && process.env.NODE_ENV !== "production") {
    console.log(`[Email] DEV verification code for ${toEmail}: ${code}`);
  }
  return sendMail({
    to: toEmail,
    subject: `${code} is your Library Checker verification code`,
    html: `
      <p>Your Library Checker verification code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;">${escapeHtml(code)}</p>
      <p>It expires in 10 minutes. If you didn't create an account, you can ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(toEmail, code) {
  if (!emailConfigured() && process.env.NODE_ENV !== "production") {
    console.log(`[Email] DEV password reset code for ${toEmail}: ${code}`);
  }
  return sendMail({
    to: toEmail,
    subject: `${code} is your Library Checker password reset code`,
    html: `
      <p>Your Library Checker password reset code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;">${escapeHtml(code)}</p>
      <p>It expires in 10 minutes. If you didn't ask to reset your password, you can ignore this email — your password hasn't changed.</p>
    `,
  });
}

const escapeAttr = (url) => escapeHtml(String(url));

// Each item: { title, author, libraryName, physical, searchUrl, digital: ["eBook", ...], digitalUrl }.
// A book can be newly available in print, digitally, or both.
export function buildAvailabilityEmail(items) {
  const rows = items.map(b => {
    const lib  = escapeHtml(b.libraryName || "your library");
    const what = [];
    if (b.physical) {
      what.push(b.searchUrl ? `<a href="${escapeAttr(b.searchUrl)}">available at ${lib}</a>` : `available at ${lib}`);
    }
    if (b.digital?.length) {
      const formats = b.digital.map(escapeHtml).join(" and ");
      what.push(b.digitalUrl
        ? `<a href="${escapeAttr(b.digitalUrl)}">${formats} ready to borrow at ${lib}</a>`
        : `${formats} ready to borrow at ${lib}`);
    }
    return `
    <li style="margin-bottom:8px;">
      <strong>${escapeHtml(b.title)}</strong>${b.author ? ` by ${escapeHtml(b.author)}` : ""}
      — ${what.join(" · ")}
    </li>`;
  }).join("");

  const n = items.length;
  return {
    subject: `${n} book${n !== 1 ? "s" : ""} from your shelf ${n !== 1 ? "are" : "is"} now available`,
    html: `
      <p>Good news — these books from your Goodreads shelf are now available:</p>
      <ul>${rows}</ul>
      <p style="color:#888;font-size:12px;">You're getting this because you're a Library Checker Premium subscriber with shelf monitoring enabled.</p>
    `,
  };
}

export async function sendAvailabilityEmail(toEmail, newlyAvailable) {
  if (!newlyAvailable.length) return;
  const { subject, html } = buildAvailabilityEmail(newlyAvailable);
  await sendMail({ to: toEmail, subject, html });
}

// Forwards a website contact-form message to the support inbox, with the
// sender's address as Reply-To so answering it goes straight to them. Returns
// false (and sends nothing) when no recipient or email transport is configured.
export async function sendContactEmail({ name, email, topicLabel, message }) {
  const to = process.env.SUPPORT_EMAIL || process.env.SMTP_USER;
  if (!to || !emailConfigured()) return false;

  // The subject echoes the start of the message; keep angle brackets out of it.
  const preview = message.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return sendMail({
    to,
    replyTo: email,
    subject: `[Library Checker] ${topicLabel}: ${preview}`,
    html: `
      <p><strong>New message from the website contact form</strong></p>
      <p><strong>Topic:</strong> ${escapeHtml(topicLabel)}<br>
         <strong>Name:</strong> ${escapeHtml(name || "(not given)")}<br>
         <strong>Email:</strong> ${escapeHtml(email)}</p>
      <hr>
      <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    `,
  });
}
