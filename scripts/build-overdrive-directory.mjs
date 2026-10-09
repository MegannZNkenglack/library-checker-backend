// scripts/build-overdrive-directory.mjs
// Downloads OverDrive's public library directory (name, key, home page) into
// src/data/overdrive-libraries.json. src/overdrive.js uses it to work out which
// OverDrive/Libby library belongs to a given BiblioCommons library.
// Re-run occasionally (e.g. quarterly): node scripts/build-overdrive-directory.mjs

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../src/data/overdrive-libraries.json");
const PER_PAGE = 100; // the API rejects anything larger
const CONCURRENCY = 6;

async function fetchPage(page, attempt = 1) {
  const url = `https://thunder.api.overdrive.com/v2/libraries?perPage=${PER_PAGE}&page=${page}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    if (attempt >= 4) throw new Error(`page ${page}: ${err.message}`);
    await new Promise(r => setTimeout(r, 500 * attempt));
    return fetchPage(page, attempt + 1);
  }
}

const first = await fetchPage(1);
const totalPages = Math.ceil(first.totalItems / PER_PAGE);
console.log(`${first.totalItems} libraries across ${totalPages} pages`);

const pages = new Array(totalPages);
pages[0] = first;
let next = 2;
async function worker() {
  while (next <= totalPages) {
    const p = next++;
    pages[p - 1] = await fetchPage(p);
    if (p % 20 === 0) console.log(`  page ${p}/${totalPages}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const seen = new Set();
const libraries = [];
for (const page of pages) {
  for (const it of page.items || []) {
    if (!it.preferredKey || seen.has(it.preferredKey)) continue;
    seen.add(it.preferredKey);
    if (it.status && it.status !== "Live") continue;
    libraries.push({
      key:  it.preferredKey,
      name: it.name,
      home: it.links?.libraryHome?.href || null,
    });
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(libraries));
console.log(`Wrote ${libraries.length} live libraries to ${OUT}`);
