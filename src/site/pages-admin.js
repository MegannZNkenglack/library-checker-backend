// src/site/pages-admin.js — the private stats page shell. It contains no data:
// the numbers are fetched after the token is entered (see assets/admin.js).

import { page } from "./layout.js";

export function adminPage() {
  return page({
    path: "/admin",
    title: "Stats",
    description: "Private statistics for Library Checker.",
    noindex: true,
    scripts: ["/assets/admin.js"],
    body: `
  <section class="page-head container">
    <h1>Stats</h1>
    <p class="lead">Private. Aggregate counts only — no emails, names or book titles.</p>
  </section>

  <section class="section pt-sm">
    <div class="container">
      <div class="container-narrow">
        <form id="admin-form" class="form-card" novalidate>
          <div class="form-row">
            <label for="admin-token">Admin token</label>
            <input class="field" id="admin-token" type="password" autocomplete="off" required>
          </div>
          <button class="btn btn-primary" type="submit">Show stats</button>
          <div class="form-status" id="admin-status" role="status" aria-live="polite" hidden></div>
        </form>
      </div>
      <div id="stats" class="stats" hidden></div>
    </div>
  </section>`,
  });
}
