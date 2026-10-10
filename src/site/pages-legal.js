// src/site/pages-legal.js — Privacy, Terms, checkout result pages and the 404 page.

import { page, esc } from "./layout.js";

// Change this date whenever the policy or terms text changes.
const UPDATED = "October 9, 2026";

const supportEmail = () => process.env.SUPPORT_EMAIL || "support@example.com";

export function privacy() {
  const email = esc(supportEmail());
  return page({
    path: "/privacy",
    title: "Privacy policy",
    description: "What Library Checker collects, how it's used, who it's shared with, and how to have your data deleted.",
    body: `
  <section class="page-head container"><h1>Privacy policy</h1></section>
  <div class="container-narrow prose">
    <p class="updated">Last updated: ${UPDATED}</p>

    <h2>What we collect</h2>
    <ul>
      <li><strong>Account info:</strong> your email address, and if you sign in with Google, your Google account ID and name.</li>
      <li><strong>Book checks:</strong> the ISBN, title, author and format of books you check, plus the library you selected and the result — stored as your check history. For premium shelf monitoring, we also keep the books on the shelves you scan so we can re-check them overnight.</li>
      <li><strong>Billing:</strong> subscription status and payment method are handled entirely by Stripe. We store your Stripe customer and subscription IDs, not your card details.</li>
      <li><strong>Contact form:</strong> if you write to us through this website, we receive the name (optional), email address and message you submit, and use them only to reply.</li>
    </ul>

    <h2>How we use it</h2>
    <p>To operate your account (sign-in, daily usage limits, subscription tier), to show your check history back to you in the extension (and let you export it), and to email you: a verification code when you sign up, a code if you reset your password, and — for premium subscribers using shelf monitoring — a notice when a watched book becomes available. We do not sell your data or share it with advertisers.</p>

    <h2>Third parties</h2>
    <p>Book availability lookups are sent to your chosen library's catalog (BiblioCommons), to NoveList/EBSCO, and to OverDrive (Libby) for digital copies. Emails are sent through Gmail (Google). Sign-in and billing are handled by Google and Stripe respectively, under their own privacy policies.</p>

    <h2>This website</h2>
    <p>This website doesn't use analytics or advertising cookies. Its pages load the DM Sans and DM Serif Display fonts from Google Fonts, so your browser contacts Google when you visit.</p>

    <h2>Data retention and deletion</h2>
    <p>Check history and account data are kept while your account is active. You can delete your check history yourself from the extension's History tab. To delete your account and all associated data, contact us using the form or address below.</p>

    <h2>Security</h2>
    <p>Passwords are hashed with bcrypt and never stored in plain text. All traffic to our backend is encrypted with HTTPS.</p>

    <h2>Contact</h2>
    <p>Questions about this policy or your data: use the <a href="/contact?topic=account">contact form</a> or email <a href="mailto:${email}">${email}</a>.</p>
  </div>`,
  });
}

export function terms() {
  const email = esc(supportEmail());
  return page({
    path: "/terms",
    title: "Terms of service",
    description: "The terms for using the Library Checker extension and website, including plans, billing and acceptable use.",
    body: `
  <section class="page-head container"><h1>Terms of service</h1></section>
  <div class="container-narrow prose">
    <p class="updated">Last updated: ${UPDATED}</p>

    <h2>The service</h2>
    <p>Library Checker is a browser extension that checks whether a book you're viewing on Goodreads is available at a library you select. Availability and wait-time data come from third-party sources (your library's catalog, NoveList/EBSCO and OverDrive) and may occasionally be incomplete, outdated or wrong — always confirm with your library before relying on it. Library Checker is an independent project and isn't affiliated with Goodreads, Amazon, BiblioCommons, OverDrive or Libby.</p>

    <h2>Accounts</h2>
    <p>You need an account (email and password, or Google sign-in) to use the service. You're responsible for keeping your login credentials secure and for activity that happens under your account.</p>

    <h2>Free and paid plans</h2>
    <ul>
      <li><strong>Free:</strong> a limited number of book checks and shelf scans per day, and a limited number of libraries per check.</li>
      <li><strong>Premium:</strong> a paid monthly subscription billed through Stripe, currently $5/month, with unlimited checks and shelf scans, more libraries, and overnight availability alerts.</li>
    </ul>
    <p>You can cancel anytime from the extension's Account tab (via the Stripe billing portal). Cancelling stops future billing but doesn't refund the current period — you keep premium access until the end of the period you already paid for, then your account reverts to the free plan.</p>

    <h2>Acceptable use</h2>
    <p>Don't use the service to abuse, scrape at scale, or overload our backend or the libraries and catalogs it queries on your behalf. We may suspend accounts that do.</p>

    <h2>No warranty</h2>
    <p>The service is provided "as is." We don't guarantee it will be uninterrupted, error-free, or that availability results are always accurate, since we depend on third-party data we don't control.</p>

    <h2>Limitation of liability</h2>
    <p>To the extent permitted by law, Library Checker isn't liable for indirect, incidental or consequential damages arising from your use of the service, including a wasted trip to the library for a book that turned out not to be available.</p>

    <h2>Changes</h2>
    <p>We may update these terms or the service itself over time. Material changes will be reflected here with an updated date.</p>

    <h2>Governing law</h2>
    <p>These terms are governed by the laws of Ontario, Canada.</p>

    <h2>Contact</h2>
    <p>Questions about these terms: use the <a href="/contact">contact form</a> or email <a href="mailto:${email}">${email}</a>.</p>
  </div>`,
  });
}

// Stripe sends people here after checkout; STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL point at these.
export function billingSuccess() {
  return page({
    path: "/billing/success",
    title: "You're subscribed",
    description: "Your Library Checker Premium subscription is active.",
    noindex: true,
    body: `
  <section class="section"><div class="container-narrow center">
    <span class="eyebrow">Premium is active</span>
    <div class="page-head"><h1>You're all set</h1>
      <p class="lead">Thank you for subscribing. You can close this tab and go back to Library Checker — your account now has unlimited checks, unlimited shelf scans and overnight alerts.</p>
    </div>
    <a class="btn btn-secondary" href="/help">Premium tips in the help guide</a>
  </div></section>`,
  });
}

export function billingCancel() {
  return page({
    path: "/billing/cancel",
    title: "Checkout cancelled",
    description: "Your Library Checker checkout was cancelled and nothing was charged.",
    noindex: true,
    body: `
  <section class="section"><div class="container-narrow center">
    <div class="page-head"><h1>Checkout cancelled</h1>
      <p class="lead">No changes were made and you haven't been charged. You can close this tab and try again any time from the extension's Account tab.</p>
    </div>
    <a class="btn btn-secondary" href="/pricing">See what Premium includes</a>
  </div></section>`,
  });
}

export function notFound() {
  return page({
    path: "/404",
    title: "Page not found",
    description: "That page doesn't exist.",
    noindex: true,
    body: `
  <section class="section"><div class="container-narrow center">
    <span class="eyebrow">404</span>
    <div class="page-head"><h1>We couldn't find that page</h1>
      <p class="lead">It may have moved, or the address might have a typo.</p>
    </div>
    <p><a class="btn btn-primary" href="/">Go to the home page</a></p>
    <p class="muted mt-18">Or look through the <a href="/help">help guide</a> and <a href="/faq">FAQ</a>.</p>
  </div></section>`,
  });
}
