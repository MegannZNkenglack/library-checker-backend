// src/site/layout.js
// Shared page shell (header, footer, meta tags) for every public website page.

export const SITE_NAME = "Library Checker";
export const STORE_URL = "https://chromewebstore.google.com/detail/library-checker/cifkfcmbfhaaolbppobmmjfddiaponfl";
export const SITE_URL  = (process.env.SITE_URL || "https://library-checker-backend.onrender.com").replace(/\/+$/, "");

// Bumped whenever site.css / site.js change, so browsers fetch the new copy.
export const ASSET_VERSION = "3";

const NAV = [
  { path: "/pricing",   label: "Pricing" },
  { path: "/libraries", label: "Libraries" },
  { path: "/help",      label: "Help" },
  { path: "/faq",       label: "FAQ" },
  { path: "/whats-new", label: "What's new" },
  { path: "/contact",   label: "Contact" },
];

const FOOTER = [
  { heading: "Product", links: [["/", "Home"], ["/pricing", "Pricing"], ["/libraries", "Supported libraries"], ["/whats-new", "What's new"]] },
  { heading: "Support", links: [["/help", "Getting started"], ["/faq", "FAQ"], ["/contact", "Contact us"]] },
  { heading: "Legal",   links: [["/privacy", "Privacy policy"], ["/terms", "Terms of service"]] },
];

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const logoSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d367" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;

export const storeButton = (label = "Add to Chrome — it's free", cls = "btn btn-primary") =>
  `<a class="${cls}" href="${STORE_URL}" rel="noopener">${esc(label)}</a>`;

// page({ path, title, description, body, jsonLd?, noindex?, bodyClass? }) -> full HTML document
export function page({ path, title, description, body, jsonLd, noindex = false, bodyClass = "", scripts = [] }) {
  const isHome   = path === "/";
  const fullTitle = isHome ? title : `${title} — ${SITE_NAME}`;
  const url      = SITE_URL + (isHome ? "/" : path);

  const nav = NAV.map(({ path: p, label }) =>
    `<a href="${p}"${p === path ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("");

  const footer = FOOTER.map(({ heading, links }) => `
        <div class="footer-col">
          <h2 class="footer-heading">${esc(heading)}</h2>
          <ul>${links.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join("")}</ul>
        </div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  ${noindex ? '<meta name="robots" content="noindex">' : ""}
  <meta name="theme-color" content="#0d0d0d">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${SITE_URL}/assets/icon-128.png">
  <meta name="twitter:card" content="summary">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icon-32.png">
  <link rel="apple-touch-icon" href="/assets/icon-128.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=DM+Serif+Display&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/site.css?v=${ASSET_VERSION}">
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body class="${esc(bodyClass)}">
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="${SITE_NAME} home"><span class="brand-icon">${logoSvg}</span>${SITE_NAME}</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
      <nav id="site-nav" class="site-nav" aria-label="Main">${nav}</nav>
      <a class="btn btn-primary btn-small header-cta" href="${STORE_URL}" rel="noopener">Add to Chrome</a>
    </div>
  </header>

  <main id="main">
${body}
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="brand" href="/"><span class="brand-icon">${logoSvg}</span>${SITE_NAME}</a>
        <p>See whether your library has the book you're looking at — print, eBook or audiobook — without leaving Goodreads.</p>
      </div>
      <div class="footer-cols">${footer}
      </div>
    </div>
    <p class="footer-legal">Library Checker is an independent project. It isn't affiliated with or endorsed by Goodreads, Amazon, BiblioCommons, OverDrive or Libby; those names belong to their owners. Availability and wait times come from third-party library systems and can be out of date.</p>
  </footer>
  <script src="/assets/site.js?v=${ASSET_VERSION}" defer></script>
  ${scripts.map(src => `<script src="${src}?v=${ASSET_VERSION}" defer></script>`).join("\n  ")}
</body>
</html>`;
}
