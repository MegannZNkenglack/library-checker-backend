// src/site/pages-library.js — one page per supported library, e.g. /libraries/hamilton-public-library.
//
// People search for things like "Hamilton Public Library Goodreads". Each page
// answers that for one library with what is actually true of it: whether print
// and digital copies are checked, where its catalog is, and how to set it up.
// Nothing is invented: the facts come from src/data/libraries.json.

import { readFileSync } from "fs";
import { page, esc, storeButton, SITE_URL } from "./layout.js";

const LIBRARIES = JSON.parse(readFileSync(new URL("../data/libraries.json", import.meta.url), "utf8"));

// City / region for each library (used in titles so searches like "Hamilton library"
// match). Falls back to the country if a library is added to the list and not here.
const PLACES = {
  "Barrie Public Library": "Barrie, Ontario",
  "Burlington Public Library": "Burlington, Ontario",
  "Burnaby Public Library": "Burnaby, British Columbia",
  "Calgary Public Library": "Calgary, Alberta",
  "Edmonton Public Library": "Edmonton, Alberta",
  "Guelph Public Library": "Guelph, Ontario",
  "Halifax Public Libraries": "Halifax, Nova Scotia",
  "Hamilton Public Library": "Hamilton, Ontario",
  "Markham Public Library": "Markham, Ontario",
  "Mississauga Library": "Mississauga, Ontario",
  "Oakville Public Library": "Oakville, Ontario",
  "Ottawa Public Library": "Ottawa, Ontario",
  "Richmond Hill Public Library": "Richmond Hill, Ontario",
  "Richmond Public Library": "Richmond, British Columbia",
  "Surrey Libraries": "Surrey, British Columbia",
  "Toronto Public Library": "Toronto, Ontario",
  "Vancouver Public Library": "Vancouver, British Columbia",
  "Vaughan Public Libraries": "Vaughan, Ontario",
  "Austin Public Library": "Austin, Texas",
  "Boston Public Library": "Boston, Massachusetts",
  "Charlotte Mecklenburg Library": "Charlotte, North Carolina",
  "Chicago Public Library": "Chicago, Illinois",
  "Columbus Metropolitan Library": "Columbus, Ohio",
  "Hennepin County Library (Minneapolis)": "Minneapolis, Minnesota",
  "King County Library System": "King County, Washington",
  "Multnomah County Library": "Portland, Oregon",
  "New York Public Library": "New York, New York",
  "San Francisco Public Library": "San Francisco, California",
  "San Jose Public Library": "San Jose, California",
  "Seattle Public Library": "Seattle, Washington",
};

export const slugFor = (name) =>
  name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The libraries with a page: name, slug, path, place, country, catalog host, Libby key.
export const LIBRARY_PAGES = LIBRARIES.map(l => ({
  ...l,
  slug:  slugFor(l.name),
  path:  "/libraries/" + slugFor(l.name),
  place: PLACES[l.name] || (l.country === "CA" ? "Canada" : "United States"),
  host:  new URL(l.url).hostname,
}));

const faqItem = ({ q, a }) => `
        <details class="faq">
          <summary>${esc(q)}</summary>
          <div class="answer">${a}</div>
        </details>`;

export function libraryPage(lib) {
  const name    = esc(lib.name);
  const hasDigital = Boolean(lib.overdrive);
  const country = lib.country === "CA" ? "Canada" : "the United States";
  // "Hamilton Public Library (Hamilton, Ontario)"; a name that already has a bracket keeps just that.
  const label   = lib.name.includes("(") ? lib.name : `${lib.name} (${lib.place})`;

  // Other libraries in the same country, so people (and search engines) can move between pages.
  const sameCountry = LIBRARY_PAGES.filter(l => l.country === lib.country && l.slug !== lib.slug);
  const start  = sameCountry.findIndex(l => l.name.localeCompare(lib.name) > 0);
  const rotated = start < 0 ? sameCountry : [...sameCountry.slice(start), ...sameCountry.slice(0, start)];
  const nearby = rotated.slice(0, 8)
    .map(l => `<li><a href="${l.path}">${esc(l.name)}</a> <span class="muted small">${esc(l.place)}</span></li>`).join("");

  const faqs = [
    {
      q: `Does Library Checker work with ${lib.name}?`,
      a: `<p>Yes. ${name} is one of the ${LIBRARIES.length} libraries you can pick in the extension's Settings. When you check a book, Library Checker searches ${name}'s catalog (${esc(lib.host)}) and tells you whether the library has it, whether a copy is on the shelf right now, how many holds there are, and a rough wait.</p>`,
    },
    {
      q: `Can I see eBook and audiobook availability at ${lib.name}?`,
      a: hasDigital
        ? `<p>Yes. ${name} lends eBooks and audiobooks through Libby/OverDrive, so Library Checker shows whether each is available now or how long the wait is, next to the print result. Tap it to open the title at <a href="https://${esc(lib.overdrive)}.overdrive.com" rel="noopener">${esc(lib.overdrive)}.overdrive.com</a>.</p>`
        : `<p>Print availability is checked for ${name}. We haven't matched this library to its Libby/OverDrive site yet, so digital results aren't shown for it. If it lends through Libby, you can still search for it by name in Settings and add it as a digital library.</p>`,
    },
    {
      q: `Do I need a ${lib.name} card to use it?`,
      a: `<p>No. Checking availability uses the library's public catalog, so you don't need to enter a library card number. You'll need your card to place a hold or borrow, which you do on the library's own site or in Libby. Library Checker never places holds for you.</p>`,
    },
    {
      q: `Can I check ${lib.name} and another library at once?`,
      a: `<p>Yes. Add up to three libraries on the free plan (five with Premium) and one check covers them all. A green "best option" banner points out where you can read the book soonest. A check across several libraries counts as one check.</p>`,
    },
    {
      q: "Is it free?",
      a: `<p>The free plan gives you 5 book checks a day, one shelf scan a day (the first 10 books on the page), and up to 3 libraries. Premium is $5 a month for unlimited checks and shelf scans. See <a href="/pricing">pricing</a>.</p>`,
    },
  ];

  const description = `Check if ${label} has the book on Goodreads, StoryGraph or Amazon: print${hasDigital ? ", eBook and audiobook" : ""} availability and wait times. Free Chrome extension.`;

  const url = SITE_URL + lib.path;
  return page({
    path: lib.path,
    title: `${lib.name} availability on Goodreads`,
    description,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Library Checker", item: SITE_URL + "/" },
            { "@type": "ListItem", position: 2, name: "Supported libraries", item: SITE_URL + "/libraries" },
            { "@type": "ListItem", position: 3, name: lib.name, item: url },
          ],
        },
        {
          "@type": "FAQPage",
          mainEntity: faqs.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() },
          })),
        },
      ],
    },
    body: `
  <section class="page-head container">
    <p class="muted small"><a href="/libraries">Supported libraries</a> › ${name}</p>
    <h1>Is it at ${name}? Check from Goodreads, StoryGraph or Amazon</h1>
    <p class="lead">Library Checker is a free Chrome extension. On a book page it tells you whether ${esc(label)} has the book, in print${hasDigital ? ", as an eBook or as an audiobook" : ""}, and how long the wait is.</p>
    <div class="hero-actions">${storeButton()}</div>
  </section>

  <section class="section pt-sm">
    <div class="container-narrow">
      <h2>${name} at a glance</h2>
      <div class="table-wrap">
        <table class="compare">
          <tbody>
            <tr><th scope="row">Library</th><td>${name}</td></tr>
            <tr><th scope="row">Location</th><td>${esc(lib.place)}</td></tr>
            <tr><th scope="row">Print catalog</th><td>Searched through its BiblioCommons catalog, <a href="${esc(lib.url)}" rel="noopener">${esc(lib.host)}</a></td></tr>
            <tr><th scope="row">eBooks and audiobooks</th><td>${hasDigital ? `Yes, through Libby/OverDrive (<a href="https://${esc(lib.overdrive)}.overdrive.com" rel="noopener">${esc(lib.overdrive)}.overdrive.com</a>)` : "Not shown for this library yet"}</td></tr>
            <tr><th scope="row">What you see</th><td>On the shelf now, or holds and copies with a rough wait${hasDigital ? ", plus digital availability" : ""}</td></tr>
            <tr><th scope="row">Works on</th><td>Goodreads, StoryGraph and Amazon book pages (shelf scans: Goodreads)</td></tr>
            <tr><th scope="row">Library card needed?</th><td>Not to check. Only to place a hold or borrow</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container-narrow">
      <div class="section-head"><h2>Set it up for ${name}</h2></div>
      <div class="steps">
        <div class="step"><h3>Install the extension</h3><p>Add Library Checker from the Chrome Web Store and create a free account.</p></div>
        <div class="step"><h3>Choose ${name}</h3><p>Open the extension's Settings, type "${name}" in the search box and pick it as your main library.</p></div>
        <div class="step"><h3>Open a book</h3><p>On a Goodreads, StoryGraph or Amazon book page, click Check. You'll see ${name}'s answer in a few seconds.</p></div>
      </div>
      <p class="center mt-22">${storeButton()}</p>
    </div>
  </section>

  <section class="section">
    <div class="container-narrow">
      <div class="section-head"><h2>Questions about Library Checker and ${name}</h2></div>
      <div class="faq-list">${faqs.map(faqItem).join("")}
      </div>
      <p class="muted small mt-22">Library Checker is an independent project and isn't affiliated with ${name}. Availability and wait times come from the library's own systems and are estimates; confirm with the library before relying on them.</p>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container-narrow">
      <div class="section-head"><h2>Other supported libraries in ${country}</h2></div>
      <ul class="list-reset nearby-list">${nearby}</ul>
      <p class="mt-14"><a href="/libraries">See all ${LIBRARIES.length} supported libraries →</a></p>
    </div>
  </section>`,
  });
}
