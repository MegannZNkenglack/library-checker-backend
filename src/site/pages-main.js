// src/site/pages-main.js — Home, Pricing and Supported libraries.

import { readFileSync } from "fs";
import { page, esc, storeButton, SITE_URL } from "./layout.js";
import { popupMock, shelfMock, emailMock } from "./mockups.js";
import { FAQS } from "./faq.js";
import { overdriveDirectory } from "../overdrive.js";

const LIBRARIES = JSON.parse(readFileSync(new URL("../data/libraries.json", import.meta.url), "utf8"));

const faqItem = ({ q, a }, open = false) => `
        <details class="faq"${open ? " open" : ""}>
          <summary>${q}</summary>
          <div class="answer">${a}</div>
        </details>`;

const ctaBand = (title = "Know before you go", text = "Free to install, free to use. Upgrade only if you want more.") => `
  <section class="cta-band">
    <h2>${title}</h2>
    <p>${text}</p>
    ${storeButton()}
  </section>`;

// ── Home ─────────────────────────────────────────────────────────────────────
export function home() {
  const countries = new Set(LIBRARIES.map(l => l.country)).size;
  return page({
    path: "/",
    title: "Library Checker — See if your library has that Goodreads book",
    description: "A Chrome extension that shows whether your public library has the Goodreads book you're viewing — print, eBook or audiobook — with hold counts and wait times. Check a whole shelf in one click.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Library Checker",
      applicationCategory: "BrowserApplication",
      operatingSystem: "Chrome",
      url: SITE_URL + "/",
      description: "See whether your public library has the Goodreads book you're viewing, with hold counts and wait times.",
    },
    body: `
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <span class="eyebrow">Chrome extension for Goodreads</span>
        <h1>Is it at your library? <em>Know in a click.</em></h1>
        <p class="lead">Library Checker shows whether your local library has the Goodreads book you're looking at — in print, as an eBook or as an audiobook — and how long the wait is. No more switching tabs to search the catalog.</p>
        <div class="hero-actions">
          ${storeButton()}
          <a class="btn btn-secondary" href="#how-it-works">See how it works</a>
        </div>
        <p class="hero-note">Print catalogs on BiblioCommons · eBooks &amp; audiobooks at any Libby/OverDrive library · Free plan available</p>
      </div>
      <div>${popupMock()}</div>
    </div>
  </section>

  <section class="section section-alt" id="how-it-works">
    <div class="container">
      <div class="section-head">
        <h2>Three steps, then it just works</h2>
        <p class="lead">Set your library once and every Goodreads page can answer the question for you.</p>
      </div>
      <div class="steps">
        <div class="step"><h3>Install and pick your library</h3><p>Add the extension, then choose your library — or up to three — in Settings.</p></div>
        <div class="step"><h3>Browse Goodreads as usual</h3><p>On any book page, click Check. It looks the book up at your library while you read.</p></div>
        <div class="step"><h3>See the answer on the page</h3><p>On the shelf, in the hold queue, or available as an eBook or audiobook — with the wait time.</p></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-head">
        <h2>More than "yes" or "no"</h2>
        <p class="lead">The details that decide whether you'll actually get to read it this month.</p>
      </div>
      <div class="grid grid-3">
        <div class="card"><div class="icon-circle" aria-hidden="true">📖</div><h3>Real availability</h3><p>See whether a copy is on the shelf right now or every copy is out — not just whether the library owns the book.</p></div>
        <div class="card"><div class="icon-circle" aria-hidden="true">⏳</div><h3>Hold queue and wait time</h3><p>How many people are waiting, how many copies there are, and a rough estimate of how long you'd wait.</p></div>
        <div class="card"><div class="icon-circle" aria-hidden="true">📱</div><h3>eBooks and audiobooks</h3><p>Where your library lends through Libby/OverDrive, see digital availability and wait times alongside print.</p></div>
        <div class="card"><div class="icon-circle" aria-hidden="true">🏛️</div><h3>More than one library</h3><p>Hold a card at two libraries? Check up to three at once (five with Premium) and see which has it first.</p></div>
        <div class="card"><div class="icon-circle" aria-hidden="true">📚</div><h3>Whole-shelf scan</h3><p>Open your Want to Read shelf and badge every book in one click. Free covers the first 10 books; Premium covers the page.</p></div>
        <div class="card"><div class="icon-circle" aria-hidden="true">🗂️</div><h3>History you can export</h3><p>Search everything you've checked, filter by result or library, and export it as a spreadsheet.</p></div>
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container split">
      <div>
        <span class="eyebrow">Shelf scan</span>
        <h2>Pick your next read from what you can actually borrow</h2>
        <p>Your Want to Read shelf is full of books you can't get. Scan it once and see, next to every title, what's available now, what has a wait, and what you could read as an eBook today.</p>
        <ul class="checks">
          <li>One click checks every book on the page</li>
          <li>Wait times shown right next to each title</li>
          <li>eBook and audiobook availability under each badge</li>
          <li><strong>Premium:</strong> open the library pages for all your available, hold-queue or digital books at once</li>
        </ul>
        <a class="btn btn-secondary" href="/pricing">Free vs Premium</a>
      </div>
      <div>${shelfMock()}</div>
    </div>
  </section>

  <section class="section">
    <div class="container split">
      <div>${emailMock()}</div>
      <div>
        <span class="eyebrow">Premium alerts</span>
        <h2>Let the library tell you when it's your turn</h2>
        <p>Premium re-checks the books from your shelf scans every night. When something becomes available to borrow — in print, or as an eBook or audiobook that was all checked out — you get a short email.</p>
        <ul class="checks">
          <li>No need to keep re-checking the catalog</li>
          <li>Covers print and digital copies</li>
          <li>Follows your primary library</li>
        </ul>
        <a class="btn btn-secondary" href="/faq">How alerts work</a>
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="section-head">
        <h2>Simple pricing</h2>
        <p class="lead">Start free. Upgrade only if you want shelf scans without limits and overnight alerts.</p>
      </div>
      <div class="plans">
        <div class="plan">
          <h3>Free</h3>
          <div class="plan-price">$0</div>
          <p class="muted">Everything you need for everyday checks.</p>
          <ul class="checks">
            <li>5 book checks a day</li>
            <li>1 shelf scan a day (first 10 books)</li>
            <li>Up to 3 libraries</li>
            <li>eBook and audiobook availability</li>
            <li>Hold counts and wait estimates</li>
            <li>Searchable, exportable history</li>
          </ul>
          ${storeButton("Add to Chrome", "btn btn-secondary")}
        </div>
        <div class="plan featured">
          <span class="plan-flag">Premium</span>
          <h3>Premium</h3>
          <div class="plan-price">$5 <small>/ month</small></div>
          <p class="muted">For people who live on their hold list.</p>
          <ul class="checks">
            <li>Unlimited book checks</li>
            <li>Unlimited shelf scans (the whole page)</li>
            <li>Up to 5 libraries</li>
            <li>Overnight email alerts for print and digital</li>
            <li>Open all your hold pages in one click</li>
            <li>Everything in Free</li>
          </ul>
          ${storeButton("Get Premium", "btn btn-primary")}
        </div>
      </div>
      <p class="center muted mt-22"><a href="/pricing">See the full comparison →</a></p>
    </div>
  </section>

  <section class="section">
    <div class="container-narrow">
      <div class="section-head">
        <h2>Questions</h2>
      </div>
      <div class="faq-list">${FAQS.slice(0, 5).map(f => faqItem(f)).join("")}
      </div>
      <p class="center mt-22"><a href="/faq">More questions →</a></p>
    </div>
  </section>
${ctaBand()}`,
  });
}

// ── Pricing ──────────────────────────────────────────────────────────────────
export function pricing() {
  const row = (feature, free, premium) =>
    `<tr><td>${feature}</td><td>${free}</td><td class="yes">${premium}</td></tr>`;
  return page({
    path: "/pricing",
    title: "Pricing",
    description: "Library Checker is free to use, with a $5/month Premium plan for unlimited shelf scans, more libraries and overnight availability alerts.",
    body: `
  <section class="page-head container">
    <h1>Free to start. Premium when you want more.</h1>
    <p class="lead">The free plan covers everyday checking. Premium is for people who scan whole shelves and want to be told when a book frees up.</p>
  </section>

  <section class="section pt-sm">
    <div class="container">
      <div class="plans">
        <div class="plan">
          <h3>Free</h3>
          <div class="plan-price">$0</div>
          <p class="muted">No card needed.</p>
          <ul class="checks">
            <li>5 book checks a day</li>
            <li>1 shelf scan a day (first 10 books on the page)</li>
            <li>Up to 3 libraries</li>
            <li>eBook and audiobook availability</li>
            <li>Hold counts and wait estimates</li>
            <li>Searchable history with CSV/JSON export</li>
            <li class="off">Overnight availability alerts</li>
            <li class="off">One-click hold pages</li>
          </ul>
          ${storeButton("Add to Chrome", "btn btn-secondary")}
        </div>
        <div class="plan featured">
          <span class="plan-flag">Best value</span>
          <h3>Premium</h3>
          <div class="plan-price">$5 <small>/ month</small></div>
          <p class="muted">Cancel any time.</p>
          <ul class="checks">
            <li>Unlimited book checks</li>
            <li>Unlimited shelf scans (the whole page)</li>
            <li>Up to 5 libraries</li>
            <li>eBook and audiobook availability</li>
            <li>Hold counts and wait estimates</li>
            <li>Searchable history with CSV/JSON export</li>
            <li>Overnight email alerts (print and digital)</li>
            <li>Open all your hold pages in one click</li>
          </ul>
          ${storeButton("Get Premium", "btn btn-primary")}
        </div>
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="section-head"><h2>Compare plans</h2></div>
      <div class="table-wrap">
        <table class="compare">
          <thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Premium</th></tr></thead>
          <tbody>
            ${row("Book checks", "5 per day", "Unlimited")}
            ${row("Shelf scans", "1 per day · first 10 books", "Unlimited · whole page")}
            ${row("Libraries per check", "Up to 3", "Up to 5")}
            ${row("Print availability and hold queue", "✓", "✓")}
            ${row("Wait-time estimates", "✓", "✓")}
            ${row("eBooks and audiobooks (Libby/OverDrive)", "✓", "✓")}
            ${row("History search and export", "✓", "✓")}
            ${row("Overnight email alerts", "—", "✓")}
            ${row("Open hold pages in one click", "—", "✓")}
          </tbody>
        </table>
      </div>
      <p class="muted center mt-18 small">A check across several libraries counts as one check.</p>
    </div>
  </section>

  <section class="section">
    <div class="container-narrow">
      <div class="section-head"><h2>Billing questions</h2></div>
      <div class="faq-list">
        ${faqItem({ q: "How do I upgrade?", a: `<p>Install the extension, open the Account tab, sign in, and choose <strong>Upgrade to Premium</strong>. Payment is handled by Stripe — we never see or store your card details.</p>` })}
        ${faqItem({ q: "How do I cancel?", a: `<p>Account tab → <strong>Manage billing</strong>. You keep Premium until the end of the period you've paid for, then your account returns to the free plan. Your history stays.</p>` })}
        ${faqItem({ q: "Do you offer refunds?", a: `<p>Cancelling stops future charges but doesn't refund the current period. If something went wrong with a payment, <a href="/contact?topic=billing">contact us</a> and we'll sort it out.</p>` })}
        ${faqItem({ q: "What happens to my data if I go back to Free?", a: `<p>Nothing is deleted. You keep your account and history; Premium-only features such as overnight alerts simply stop.</p>` })}
      </div>
    </div>
  </section>
${ctaBand("Ready when you are", "Install it, pick your library, and check your first book in under a minute.")}`,
  });
}

// ── Supported libraries ──────────────────────────────────────────────────────
export function libraries() {
  const rows = LIBRARIES.map(l => `
        <li class="lib-row" data-country="${esc(l.country)}" data-name="${esc(l.name.toLowerCase())}">
          <span><strong>${esc(l.name)}</strong><br><span class="where">${l.country === "CA" ? "Canada" : "United States"}</span></span>
          ${l.overdrive ? '<span class="tag" title="eBooks and audiobooks through Libby/OverDrive">+ Libby / OverDrive</span>' : ""}
        </li>`).join("");
  const withDigital = LIBRARIES.filter(l => l.overdrive).length;

  return page({
    path: "/libraries",
    title: "Supported libraries",
    description: `Library Checker works with ${LIBRARIES.length} Canadian and US public libraries on the BiblioCommons platform, plus any BiblioCommons library you add yourself. See the full list.`,
    body: `
  <section class="page-head container">
    <h1>Supported libraries</h1>
    <p class="lead">Library Checker works with libraries whose catalog runs on BiblioCommons. Pick yours from the list in the extension's Settings.</p>
  </section>

  <section class="section pt-sm">
    <div class="container-narrow container-wide">
      <div class="lib-tools">
        <input class="field" id="lib-search" type="search" placeholder="Search for your library…" aria-label="Search libraries" autocomplete="off">
        <div class="chips" role="group" aria-label="Filter by country">
          <button class="chip" type="button" data-country="all" aria-pressed="true">All</button>
          <button class="chip" type="button" data-country="CA" aria-pressed="false">Canada</button>
          <button class="chip" type="button" data-country="US" aria-pressed="false">United States</button>
        </div>
      </div>
      <p class="lib-count" id="lib-count" aria-live="polite">${LIBRARIES.length} libraries</p>
      <ul class="lib-list list-reset">${rows}
      </ul>
      <div class="lib-empty" id="lib-empty" hidden>
        <p><strong>No library matches that search.</strong></p>
        <p>Yours might still work — see below.</p>
      </div>
      <p class="muted mt-14 small">${withDigital} of these also show eBook and audiobook availability through Libby/OverDrive (marked <span class="tag">+ Libby / OverDrive</span>). Digital lookups depend on how each library lends, so it can vary.</p>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container-narrow">
      <div class="section-head"><h2>Don't see your library?</h2></div>
      <div class="prose pb-0">
        <p><strong>If your library's catalog is on BiblioCommons</strong> — its address looks like <code>yourlibrary.bibliocommons.com</code> — you can add it yourself: open the extension, go to Settings, choose <em>Add a custom library</em> and paste the address.</p>
        <p><strong>If it lends eBooks and audiobooks through Libby/OverDrive</strong> — most public libraries do — you can still use Library Checker for digital copies, whatever catalog system the library runs. In the extension's Settings, search for your library by name: ${overdriveDirectory.length.toLocaleString("en-US")} Libby/OverDrive libraries are listed, marked <em>Digital only</em>. You'll see whether the eBook or audiobook is available and how long the wait is; print copies aren't checked for these libraries yet.</p>
        <p><strong>For print catalogs on other systems</strong>, we're working towards covering more — <a href="/contact?topic=library">tell us which library you use</a> so we know what matters most.</p>
      </div>
    </div>
  </section>
${ctaBand("Check your library today", "Free to install. Pick your library once and you're set.")}`,
  });
}
