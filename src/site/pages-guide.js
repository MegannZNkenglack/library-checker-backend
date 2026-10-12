// src/site/pages-guide.js — /guide: the how-to video, ten illustrated steps and the PDF.
//
// The pictures in src/site/guide/img/, and the PDF and video beside them, are made by the guide
// tooling in the extension project (guide/source) from the real extension screens, using example
// books and libraries. They show version 2.9.1. When the extension's look changes, regenerate
// them, copy them here, and bump GUIDE_VERSION so browsers fetch the new pictures.

import { openSync, readSync, closeSync, statSync } from "fs";
import { page, esc, storeButton, SITE_URL } from "./layout.js";
import { ctaBand } from "./pages-main.js";

export const GUIDE_PDF   = "/guide/library-checker-guide.pdf";
export const GUIDE_VIDEO = "/guide/library-checker-how-to.mp4";
const IMG = "/guide/img/";
const GUIDE_VERSION = "1";
const VIDEO_SECONDS = 79;

// Width and height from a PNG's header, so the page keeps the right space while a picture loads.
function pngSize(file) {
  try {
    const fd = openSync(new URL(`./guide/img/${file}`, import.meta.url), "r");
    try {
      const head = Buffer.alloc(24);
      readSync(fd, head, 0, 24, 0);
      return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
    } finally { closeSync(fd); }
  } catch { return null; }
}

// "4 MB" for the PDF; empty if the file isn't there.
function pdfSize() {
  try { return `${Math.max(1, Math.round(statSync(new URL("./guide/library-checker-guide.pdf", import.meta.url)).size / 1048576))} MB`; }
  catch { return ""; }
}

const fig = (file, alt, caption, kind = "popup") => {
  const s = pngSize(file);
  return `<figure class="guide-fig ${kind}"><img src="${IMG}${file}?v=${GUIDE_VERSION}"${s ? ` width="${s.w}" height="${s.h}"` : ""} alt="${esc(alt)}" loading="lazy" decoding="async">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}</figure>`;
};
const figs = (inner, cls = "") => `<div class="guide-figs ${cls}">${inner}</div>`;
const tier = (t) => `<span class="tier ${t}">${t === "premium" ? "Premium" : "Free"}</span>`;

// layout: "" (text beside the picture), "flip" (picture on the left) or "stack" (picture below the text)
const step = ({ n, title, lead, text, pictures = "", layout = "" }) => `
      <section class="guide-step ${layout}" id="step-${n}" aria-labelledby="step-${n}-title">
        <div class="guide-text">
          <div class="guide-step-head"><span class="guide-num" aria-hidden="true">${n}</span><span class="guide-kicker">Step ${n}</span></div>
          <h2 id="step-${n}-title">${title}</h2>
          <p class="guide-lead">${lead}</p>
          ${text}
        </div>${pictures ? `
        ${pictures}` : ""}
      </section>`;

// ── The ten steps ────────────────────────────────────────────────────────────
const STEPS = [
  {
    n: 1, short: "Install and pin", layout: "stack",
    title: "Add it to Chrome and pin it",
    lead: "Install Library Checker, then pin it to your toolbar so it's always one click away.",
    text: `<ol>
            <li>Open the Library Checker page in the Chrome Web Store and choose <strong>Add to Chrome</strong>. Confirm when Chrome asks.</li>
            <li>Click the puzzle-piece icon at the top right of Chrome to see your extensions.</li>
            <li>Find Library Checker and click the pin next to it. Its icon now stays on your toolbar.</li>
          </ol>
          <div class="callout">You need Google Chrome and a free Library Checker account. You don't need your library card just to check availability, only to place a hold or borrow.</div>
          ${storeButton("Add to Chrome — it's free")}`,
  },
  {
    n: 2, short: "Account",
    title: "Create your free account",
    lead: "An account keeps your daily checks, history and plan together, on any computer.",
    text: `<ol>
            <li>Click the Library Checker icon and open the <strong>Account</strong> tab.</li>
            <li>Choose <strong>Continue with Google</strong>, or sign up with your email and a password.</li>
            <li>If you use email, we send a 6-digit code to confirm the address. Type it in and you're signed in. The code expires after 10 minutes.</li>
          </ol>
          <p>Forgot your password? Choose <strong>Forgot password?</strong> on the sign-in screen and we'll email a code to set a new one.</p>`,
    pictures: figs(
      fig("account-signin.png", "The Library Checker popup on the Account tab, with email and password fields, a Sign in button and a Continue with Google button", "Sign in, or sign up") +
      fig("account-verify.png", "The popup asking for the 6-digit code that was emailed, with a Verify email button", "Email sign-ups confirm with a code"), "pair"),
  },
  {
    n: 3, short: "Your library", layout: "flip",
    title: "Choose your library",
    lead: "Tell Library Checker where you borrow. You can add more than one.",
    text: `<ol>
            <li>Open the <strong>Settings</strong> tab and search for your library by city or name.</li>
            <li>Tap it to add it. The first library is your <strong>primary</strong> one; tap <em>Make primary</em> next to another to change that.</li>
            <li>Hold a card at a second library? Add that too.</li>
          </ol>
          <p>${tier("free")} up to 2 libraries. ${tier("premium")} up to 5. A check across several libraries counts as one check.</p>
          <p>Your library isn't listed? Libraries that lend eBooks and audiobooks through Libby/OverDrive can be added as <em>digital only</em>, and a BiblioCommons library can be added with <em>Add a custom library</em>. See <a href="/libraries">supported libraries</a>.</p>`,
    pictures: figs(fig("settings-libraries.png", "The Settings tab showing two chosen libraries, Hamilton Public Library as primary and Toronto Public Library, a note about the free plan's 2-library limit, and a search box with a list of libraries", "Settings: your libraries, and a search to add more")),
  },
  {
    n: 4, short: "Check a book", layout: "stack",
    title: "Check a book",
    lead: "Open a book, click Check. The answer appears on the page in a few seconds.",
    text: `<ol>
            <li>On Goodreads, open any book. A small prompt appears in the bottom corner.</li>
            <li>Click <strong>Check</strong>. The result opens right on the page.</li>
            <li>Prefer the toolbar? Click the Library Checker icon and press <strong>Check library</strong>. That's also how you check on StoryGraph and Amazon (step 8).</li>
          </ol>
          <p>The free plan allows 5 checks a day, and the prompt shows how many you have left.</p>`,
    pictures: figs(fig("book-prompt.png", "A Goodreads book page for Project Hail Mary with the Library Checker prompt, Check your library? and a Check button, in the bottom-right corner", "On a book page, click Check in the corner prompt", "page")),
  },
  {
    n: 5, short: "Read the result", layout: "stack",
    title: "Read the result",
    lead: "The colour tells you at a glance. Tap a card to open the book at your library.",
    text: `<p>If your library lends eBooks and audiobooks through Libby/OverDrive, you'll also see whether each one is available now or how long the wait is.</p>`,
    pictures: figs(`<div class="guide-cards">` +
      fig("result-holds.png", "A result card: In Hamilton Public Library's collection, 85 holds on 9 copies, about 7 months wait, with eBook and audiobook waits and the best option at another library", "Every copy is out: holds, copies, a rough wait, and digital copies", "tile") +
      fig("result-available.png", "A green result card: Available now at Hamilton Public Library, 2 of 9 copies on the shelf", "Available now: a copy is on the shelf", "tile") +
      fig("result-edition.png", "A blue result card: In Hamilton Public Library's collection, a different edition than this one", "Other edition: the library has the title, just not this edition. Tap to browse.", "tile") +
      fig("result-notfound.png", "A grey result card: Not in catalog, Hamilton Public Library doesn't have this title", "Not in catalog: the library doesn't list it", "tile") +
      fig("result-error.png", "A red result card: Couldn't reach library, check your connection and try again", "Couldn't reach the library: try again in a minute. A check that fails like this isn't counted.", "tile") +
      `</div>`),
  },
  {
    n: 6, short: "Several libraries", layout: "flip",
    title: "Check more than one library",
    lead: "Hold a card at two libraries? One check covers both and tells you where to go.",
    text: `<ul>
            <li>Your <strong>main library</strong> comes first, with holds, copies, wait and digital copies.</li>
            <li>The green <strong>★ Best option</strong> banner shows where you can read it soonest. Available now beats a wait, and a shorter wait beats a longer one, whether that's print, an eBook or an audiobook. Tap it to open that library's page.</li>
            <li><strong>Your other libraries</strong> get a row each. Tap a row to open it.</li>
            <li>However many libraries you check, it counts as <strong>one</strong> check.</li>
          </ul>`,
    pictures: figs(fig("multi-result.png", "The popup after checking Project Hail Mary at two libraries: Hamilton has an 85-hold wait, with a green Best option banner pointing to Toronto Public Library, where it is available now", "One check, two libraries")),
  },
  {
    n: 7, short: "Shelf scan", layout: "stack",
    title: "Scan a whole shelf",
    lead: "Check every book on a Goodreads shelf in one click, then pick what to read from what you can borrow.",
    text: `<ol>
            <li>On Goodreads, open one of your shelves, for example <strong>Want to Read</strong>, in <strong>list view</strong> (not the cover grid).</li>
            <li>Click <strong>Check library availability for this page</strong>. Every book on the page gets a badge: available now, on hold with the wait, other edition or not in catalog, plus eBook and audiobook lines.</li>
            <li>Want more books checked? Raise Goodreads' <em>per page</em> setting on the shelf.</li>
          </ol>
          <div class="callout"><strong>Free:</strong> 1 scan a day, the first 10 books, at your main library. <strong>Premium:</strong> unlimited, the whole page, and every library you chose.</div>
          <ul>
            <li>${tier("premium")} <strong>★ Better at …</strong> appears under a book when another of your libraries beats your main one.</li>
            <li>${tier("premium")} <strong>One-click buttons</strong> open your library's page for all the available, hold-queue or digital books at once, ten tabs at a time. You still place each hold on your library's own site.</li>
          </ul>`,
    pictures: figs(fig("shelf-scan.png", "A Goodreads Want to Read shelf after a scan: a summary line, three one-click buttons, and a badge under each title such as On hold, Available now, Not in catalog and Library has it (other edition)", "A shelf after a scan: a badge under every title", "page")),
  },
  {
    n: 8, short: "StoryGraph and Amazon", layout: "flip",
    title: "Works on StoryGraph and Amazon too",
    lead: "The same check, on the other places you find books.",
    text: `<ol>
            <li>Open a book on StoryGraph, or on Amazon (amazon.com, .ca, .co.uk or .com.au).</li>
            <li>Click the Library Checker icon and press <strong>Check library</strong>.</li>
            <li>Want the check button on those pages too? In <strong>Settings</strong>, under <em>Show the check button on other sites</em>, switch on StoryGraph or Amazon. Chrome asks for permission first; reload any open tabs afterwards.</li>
          </ol>
          <p>On Amazon the button only appears on book pages, not on other products. Whole-shelf scans work on Goodreads shelves only.</p>`,
    pictures: figs(fig("sites-settings.png", "The Settings tab with a switch for desktop notifications and tick boxes to show the check button on StoryGraph and on Amazon", "Settings: show the check button on other sites")),
  },
  {
    n: 9, short: "History and account",
    title: "Your history and your account",
    lead: "Every check is saved, searchable and yours to export.",
    text: `<ul>
            <li>The <strong>History</strong> tab keeps everything you've checked. Search by title or author, filter by result or library, and export what's shown as <strong>CSV</strong> or <strong>JSON</strong>.</li>
            <li><strong>Clear</strong> deletes your whole history, so export first if you want a copy.</li>
            <li>The <strong>Account</strong> tab shows your plan. Upgrade to Premium for $5 a month, paid through Stripe; we never see your card.</li>
            <li>To cancel, open the Account tab and choose <strong>Manage billing</strong>. You keep Premium until the end of the period you've paid for, then your account returns to the free plan and your history stays.</li>
          </ul>`,
    pictures: figs(
      fig("history.png", "The History tab with a search box, filters, Export CSV and JSON buttons, and a list of checked books with their results", "History: search, filter and export") +
      fig("account-free.png", "The Account tab for a free plan, with an Upgrade to Premium button and a Sign out button", "Account: your plan and billing"), "pair"),
  },
  {
    n: 10, short: "Alerts", layout: "flip",
    title: `Get told when it's your turn ${tier("premium")}`,
    lead: "Library Checker keeps watching the books you scanned, so you don't have to.",
    text: `<p>Each night it re-checks the books from your shelf scans at every library you chose. When one becomes available to borrow, in print or as an eBook or audiobook, you'll get:</p>
          <ul>
            <li>A green <strong>count</strong> on the toolbar icon. The extension looks for news about once an hour while Chrome is open.</li>
            <li>A <strong>card on the Home tab</strong> listing the books. Tap a book to open it at your library; it leaves the list once you've looked, or press <strong>Dismiss all</strong>.</li>
            <li>An <strong>email</strong>.</li>
          </ul>
          <p>Want a pop-up too? In <strong>Settings</strong>, under <em>Available-book alerts</em>, switch on <strong>Desktop notifications</strong>. Chrome asks for permission the first time.</p>`,
    pictures: figs(fig("alerts.png", "The Home tab with a card reading 2 books now available, listing Project Hail Mary and Dune, above the Check library button", "The Home tab lists books that have become available")),
  },
];

// ── The page ─────────────────────────────────────────────────────────────────
export function guide() {
  const size = pdfSize();
  const toc = STEPS.map(s => `<li><a href="#step-${s.n}"><b>${s.n}</b> ${esc(s.short)}</a></li>`).join("");

  return page({
    path: "/guide",
    title: "Illustrated guide and video",
    description: "Learn Library Checker in a short video and ten illustrated steps: install it, choose your library, check a book, scan a Goodreads shelf and get told when it's your turn. Free PDF to download.",
    image: SITE_URL + IMG + "video-poster.png",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: "How to use Library Checker",
      description: "A short walkthrough: install Library Checker, choose your library, check a book, scan a Goodreads shelf and get told when a book is available.",
      thumbnailUrl: [SITE_URL + IMG + "video-poster.png"],
      uploadDate: "2026-10-12",
      duration: `PT${Math.floor(VIDEO_SECONDS / 60)}M${VIDEO_SECONDS % 60}S`,
      contentUrl: SITE_URL + GUIDE_VIDEO,
    },
    body: `
  <section class="page-head container">
    <span class="eyebrow">Illustrated guide</span>
    <h1>How to use Library Checker</h1>
    <p class="lead">From install to your first result in about a minute. Watch the video, or follow the ten steps below with pictures.</p>
    <div class="guide-actions">
      <a class="btn btn-primary" href="#video">Watch the video</a>
      <a class="btn btn-secondary" href="${GUIDE_PDF}" download>Download the PDF${size ? ` (${size})` : ""}</a>
    </div>
    <p class="guide-meta">Covers version 2.9.1 and later. Steps marked ${tier("premium")} need the $5/month plan; everything else works on the free plan. <a href="/pricing">Compare plans</a></p>
  </section>

  <section class="section pt-sm" id="video">
    <div class="container">
      <div class="guide-video">
        <video controls preload="metadata" playsinline width="1920" height="1080" poster="${IMG}video-poster.png?v=${GUIDE_VERSION}" aria-label="Library Checker how-to video, ${VIDEO_SECONDS} seconds, no sound">
          <source src="${GUIDE_VIDEO}?v=${GUIDE_VERSION}" type="video/mp4">
          <p>Your browser can't play this video. <a href="${GUIDE_VIDEO}">Download it</a> or follow the steps below.</p>
        </video>
      </div>
      <p class="guide-note">${VIDEO_SECONDS} seconds, with no sound: captions are on screen, and every step is written out below. Books, wait times and libraries in the pictures are examples.</p>
      <nav class="guide-toc" aria-label="The ten steps"><ul class="list-reset">${toc}</ul></nav>
    </div>
  </section>

  <div class="container guide-steps">${STEPS.map(step).join("")}
  </div>

  <section class="section section-alt">
    <div class="container">
      <div class="section-head">
        <h2>Take it with you</h2>
        <p class="lead">Print the guide, keep it on your phone, or send it to a friend who's always asking whether the library has it.</p>
      </div>
      <div class="guide-actions">
        <a class="btn btn-primary" href="${GUIDE_PDF}" download>Download the PDF${size ? ` (${size})` : ""}</a>
        <a class="btn btn-secondary" href="/help">Help and troubleshooting</a>
        <a class="btn btn-secondary" href="/faq">FAQ</a>
      </div>
      <p class="guide-note">Something not working, or a step that doesn't match what you see? <a href="/contact">Tell us</a> and we'll fix the guide.</p>
    </div>
  </section>
${ctaBand("Ready to try it?", "Install it, pick your library, and check your first book in under a minute.")}`,
  });
}
