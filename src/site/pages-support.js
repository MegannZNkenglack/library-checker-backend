// src/site/pages-support.js — Help, FAQ, What's new and Contact.

import { page, storeButton } from "./layout.js";
import { FAQS } from "./faq.js";

// ── Help / getting started ───────────────────────────────────────────────────
export function help() {
  return page({
    path: "/help",
    title: "Help and getting started",
    description: "How to install Library Checker, choose your library, check a book, scan a Goodreads shelf, export your history, and fix common problems.",
    body: `
  <section class="page-head container">
    <h1>Getting started</h1>
    <p class="lead">From install to your first result in about a minute.</p>
  </section>

  <div class="container-narrow prose">
    <h2>1. Install the extension</h2>
    <p>Open the <a href="https://chromewebstore.google.com/detail/library-checker/cifkfcmbfhaaolbppobmmjfddiaponfl" rel="noopener">Chrome Web Store page</a> and choose <strong>Add to Chrome</strong>. Then click the puzzle-piece icon in Chrome's toolbar and pin Library Checker so it's always one click away.</p>

    <h2>2. Create an account</h2>
    <p>Click the Library Checker icon, open the <strong>Account</strong> tab and either continue with Google, or sign up with your email. If you use email, we send a 6-digit code to confirm the address — enter it and you're signed in.</p>
    <p>Forgot your password? On the sign-in screen choose <strong>Forgot password?</strong>, enter your email, and we'll send a code to set a new one.</p>

    <h2>3. Choose your library</h2>
    <p>Open the <strong>Settings</strong> tab and pick your library from the list (search by city or name). You can select more than one — up to 3 on the free plan, 5 with Premium. The first one is your <strong>primary</strong> library; use <em>Make primary</em> to change it. Your shelf scans and overnight alerts follow the primary library.</p>
    <p>Your library isn't listed? Keep typing its name in the search box — libraries that lend eBooks and audiobooks through Libby/OverDrive appear under <em>eBooks &amp; audiobooks only</em> and can be added as <em>Digital only</em> libraries (print copies aren't checked for those). If its catalog address ends in <code>.bibliocommons.com</code>, use <em>Add a custom library</em> for full support. See <a href="/libraries">supported libraries</a>.</p>

    <h2>4. Check a book</h2>
    <p>Open any book on Goodreads. A small prompt appears in the corner — click <strong>Check</strong>. You can also click the extension icon and press <strong>Check library</strong>.</p>
    <h3>Reading the result</h3>
    <ul>
      <li><strong>Available now</strong> — at least one copy is on the shelf.</li>
      <li><strong>In the collection</strong> with a hold count — every copy is out. You'll see how many holds there are, how many copies, and a rough wait.</li>
      <li><strong>Library has it (other edition)</strong> — the library owns the title, just not this exact edition. Tap to browse what it has.</li>
      <li><strong>Not in catalog</strong> — the library doesn't list it.</li>
      <li><strong>Digital</strong> — if your library lends eBooks or audiobooks through Libby/OverDrive, you'll see whether each is available now or how long the wait is. Tap it to open the title.</li>
      <li><strong>Your other libraries</strong> — a short row for each extra library you selected.</li>
    </ul>

    <h2>5. Scan a whole shelf</h2>
    <p>On Goodreads, open one of your shelves — for example <strong>Want to Read</strong> — and make sure it's shown as a list (not the cover grid). Click <strong>Check library availability for this page</strong> above the list. Every book on the page gets a badge.</p>
    <div class="callout">The scan checks the books shown on the page. To check more at once, raise Goodreads' <em>per page</em> setting on the shelf. The free plan checks the first 10 books per scan, once a day; Premium has no limit.</div>
    <p>After a scan, Premium members see buttons to open the library pages for all the available, hold-queue or digital books at once, ten tabs at a time. You still place each hold on your library's own site.</p>

    <h2>6. Search and export your history</h2>
    <p>The <strong>History</strong> tab keeps everything you've checked. Type in the search box to find a title or author, filter by result or library, and use <strong>Export CSV</strong> or <strong>JSON</strong> to download what's shown. <strong>Clear</strong> deletes your whole history, so export first if you want a copy.</p>

    <h2>7. Overnight alerts (Premium)</h2>
    <p>Books from your shelf scans are re-checked every night. When one becomes available to borrow — in print, or as an eBook or audiobook — you get an email. Alerts follow your primary library.</p>

    <h2>Troubleshooting</h2>
    <h3>"Couldn't reach library" or an error message</h3>
    <p>The library's website may be busy or briefly down. Wait a minute and press <strong>Check again</strong>. If it keeps happening for one library, <a href="/contact?topic=bug">let us know</a>.</p>
    <h3>"Sign in to check availability"</h3>
    <p>You're signed out. Open the extension's Account tab and sign in again.</p>
    <h3>A book the library has shows as "Not in catalog"</h3>
    <p>Send us the book's title and your library through the <a href="/contact?topic=bug">contact form</a>. Differences in titles, subtitles or series names between Goodreads and the catalog are the usual cause, and each report helps us improve matching.</p>
    <h3>I reached my daily limit</h3>
    <p>The free plan allows 5 book checks and one shelf scan a day; both reset each day. Premium has no limit.</p>
    <h3>The shelf scan button doesn't appear</h3>
    <p>It only shows on Goodreads shelf pages in <strong>list view</strong>. Switch the shelf from the cover grid to the table list, then reload the page.</p>
    <h3>I didn't get my verification or reset code</h3>
    <p>Check your spam folder, then use <strong>Resend code</strong> (available after a minute). Codes expire after 10 minutes.</p>

    <h2>Still stuck?</h2>
    <p><a href="/contact">Send us a message</a> and include the library you use and what you saw.</p>
  </div>`,
  });
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
export function faq() {
  const items = FAQS.map(({ q, a }) => `
        <details class="faq">
          <summary>${q}</summary>
          <div class="answer">${a}</div>
        </details>`).join("");
  return page({
    path: "/faq",
    title: "Frequently asked questions",
    description: "Answers about Library Checker: pricing, supported libraries, wait times, shelf scans, alerts, exporting your history, privacy and more.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() },
      })),
    },
    body: `
  <section class="page-head container">
    <h1>Frequently asked questions</h1>
    <p class="lead">Can't find what you need? <a href="/contact">Ask us</a>.</p>
  </section>
  <section class="section pt-sm">
    <div class="container-narrow">
      <div class="faq-list">${items}
      </div>
    </div>
  </section>`,
  });
}

// ── What's new ───────────────────────────────────────────────────────────────
const RELEASES = [
  {
    version: "2.5.0", date: "October 2026", title: "Digital copies at libraries beyond BiblioCommons",
    items: [
      ["Search for any library by name in Settings. Libraries that lend eBooks and audiobooks through Libby/OverDrive can now be added even if their print catalog isn't supported — you'll see digital availability and wait times for them.", "free"],
      ["Digital-only libraries work everywhere a library does: single checks, shelf scans, your history, and overnight alerts when a waiting eBook or audiobook frees up.", ""],
      ["Fixed a bug where changing your libraries in Settings and then checking a book without reopening the extension used your previous libraries.", ""],
    ],
  },
  {
    version: "2.4.0", date: "October 2026", title: "History search, one-click holds and digital alerts",
    items: [
      ["Search your history by title or author, filter it by result or library, and export it as CSV or JSON.", "free"],
      ["After a shelf scan, open the library pages for all your available, hold-queue or digital books at once.", "premium"],
      ["Overnight alerts now also tell you when an eBook or audiobook that was checked out becomes available.", "premium"],
      ["Clearing your history now asks for confirmation.", ""],
    ],
  },
  {
    version: "2.3.0", date: "October 2026", title: "Check several libraries at once",
    items: [
      ["Pick more than one library and see them all in a single check — up to 3 on the free plan, 5 with Premium. A check across several libraries counts as one.", ""],
      ["Choose which library is your primary one.", ""],
    ],
  },
  {
    version: "2.2.0", date: "October 2026", title: "Wait times, digital copies and safer sign-in",
    items: [
      ["See how many holds are ahead of you and a rough wait time for print books.", "free"],
      ["eBook and audiobook availability and wait times from Libby/OverDrive, where your library offers them.", "free"],
      ["Confirm your email with a 6-digit code when you sign up, and reset a forgotten password by email.", ""],
      ["Free shelf scans: one a day, covering the first 10 books on the page.", "free"],
      ["Fixed library addresses that pointed to the wrong catalog (Burlington and Burnaby were checking Boston's) and removed libraries that didn't work.", ""],
      ["Fixed shelf-scan matching for titles with apostrophes or hidden characters.", ""],
    ],
  },
  {
    version: "2.1.0", date: "August 2026", title: "Shelf scanning and overnight alerts",
    items: [
      ["Scan a Goodreads shelf and see a badge next to every book.", ""],
      ["Premium: overnight re-checks with an email when a watched book becomes available.", "premium"],
      ["Show books your library holds in a different edition, with a link to browse them.", ""],
    ],
  },
];

export function whatsNew() {
  const releases = RELEASES.map(r => `
      <article class="release">
        <div class="release-meta"><span class="version">v${r.version}</span><time>${r.date}</time></div>
        <div>
          <h2>${r.title}</h2>
          <ul>${r.items.map(([text, tier]) =>
            `<li>${text}${tier ? ` <span class="tier ${tier}">${tier === "premium" ? "Premium" : "Free"}</span>` : ""}</li>`).join("")}</ul>
        </div>
      </article>`).join("");
  return page({
    path: "/whats-new",
    title: "What's new",
    description: "Release notes for the Library Checker extension: new features, improvements and fixes.",
    body: `
  <section class="page-head container">
    <h1>What's new</h1>
    <p class="lead">Release notes for the extension. Chrome updates it for you automatically once a new version is approved.</p>
  </section>
  <section class="section pt-sm">
    <div class="container-narrow">${releases}
    </div>
  </section>`,
  });
}

// ── Contact ──────────────────────────────────────────────────────────────────
export const CONTACT_TOPICS = [
  ["question", "A question"],
  ["library",  "Suggest or fix a library"],
  ["bug",      "Report a bug or a wrong result"],
  ["feature",  "Suggest a feature"],
  ["billing",  "Billing or Premium"],
  ["account",  "My account or data (including deletion)"],
  ["other",    "Something else"],
];

export function contact() {
  return page({
    path: "/contact",
    title: "Contact us",
    description: "Get in touch about Library Checker: questions, bug reports, library requests, billing or your account.",
    body: `
  <section class="page-head container">
    <h1>Contact us</h1>
    <p class="lead">Questions, bugs, library requests — we read every message and reply by email.</p>
  </section>
  <section class="section pt-sm">
    <div class="container-narrow">
      <div class="form-card">
        <form id="contact-form" novalidate>
          <div class="form-grid">
            <div class="form-row">
              <label for="c-name">Your name <span class="hint">(optional)</span></label>
              <input class="field" id="c-name" name="name" type="text" maxlength="100" autocomplete="name">
            </div>
            <div class="form-row">
              <label for="c-email">Your email</label>
              <input class="field" id="c-email" name="email" type="email" maxlength="200" autocomplete="email" required>
            </div>
          </div>
          <div class="form-row">
            <label for="c-topic">What's this about?</label>
            <select class="field" id="c-topic" name="topic">
              ${CONTACT_TOPICS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
            </select>
          </div>
          <div class="form-row">
            <label for="c-message">Message <span class="hint">— for a library or a wrong result, include the library and the book's title</span></label>
            <textarea class="field" id="c-message" name="message" maxlength="5000" required></textarea>
          </div>
          <div class="hp" aria-hidden="true">
            <label for="c-website">Leave this empty</label>
            <input id="c-website" name="website" type="text" tabindex="-1" autocomplete="off">
          </div>
          <button class="btn btn-primary" type="submit">Send message</button>
          <div class="form-status" id="form-status" role="status" aria-live="polite" hidden></div>
        </form>
      </div>
      <p class="muted center mt-20 small">Looking for answers first? Try the <a href="/faq">FAQ</a> or the <a href="/help">help guide</a>.</p>
    </div>
  </section>`,
  });
}
