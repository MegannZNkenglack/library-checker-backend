// scripts/build-libraries.mjs
// Builds src/data/libraries.json — the list shown on the website's "Supported
// libraries" page — from the extension's own libraries.js, and notes which of
// those libraries also lend eBooks/audiobooks through Libby/OverDrive.
//
// Usage: node scripts/build-libraries.mjs [path/to/extension/libraries.js]
// Re-run whenever the extension's library list changes.

import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

// overdrive.js opens the app database on import; point it at a throwaway one.
process.env.DB_PATH = join(tmpdir(), "library-checker-build-libraries.db");
process.env.JWT_SECRET ||= "build-script";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.argv[2] || join(__dirname, "../../Library Checker Extension/libraries.js"));
const OUT = join(__dirname, "../src/data/libraries.json");

const { _internal } = await import("../src/overdrive.js");

// libraries.js declares `const LIBRARIES = [...]` for the browser; evaluate just that.
const LIBRARIES = new Function(readFileSync(source, "utf8") + "; return LIBRARIES;")();

const libraries = LIBRARIES.map((lib) => ({
  name:      lib.name,
  country:   lib.country,
  url:       lib.url,
  overdrive: _internal.matchByName(lib.name) || null,
})).sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

writeFileSync(OUT, JSON.stringify(libraries, null, 2) + "\n");
console.log(`Wrote ${libraries.length} libraries (${libraries.filter(l => l.overdrive).length} with Libby/OverDrive) to ${OUT}`);
process.exit(0);
