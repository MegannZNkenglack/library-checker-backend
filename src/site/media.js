// src/site/media.js
// Serves the files in src/site/guide/ (the PDF, the how-to video and the guide's pictures).
//
// The video needs byte-range support: Safari won't play a video without it, and every browser
// uses it to jump around in one. So a "Range: bytes=..." request gets 206 Partial Content.
// Files are small enough (a few MB) to hold in memory after the first request.

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { readdirSync } from "fs";

const GUIDE_DIR = new URL("./guide/", import.meta.url);

// Names of the pictures that exist, so only those can be requested (no path tricks).
export const GUIDE_IMAGES = (() => {
  try { return new Set(readdirSync(new URL("img/", GUIDE_DIR)).filter(f => /^[a-z0-9-]+\.png$/.test(f))); }
  catch { return new Set(); }
})();

const cache = new Map();   // relative path -> Promise<{ body, etag } | null>

export function loadGuideFile(relativePath) {
  if (!cache.has(relativePath)) {
    cache.set(relativePath, readFile(new URL(relativePath, GUIDE_DIR)).then(
      (body) => ({ body, etag: `"${createHash("sha1").update(body).digest("base64url").slice(0, 27)}"` }),
      () => null,
    ));
  }
  return cache.get(relativePath);
}

// Reads a Range header for a file of `size` bytes.
//   { start, end }  - a satisfiable single range (end is inclusive)
//   "unsatisfiable" - starts past the end of the file (answer 416)
//   null            - not a single byte range, or malformed: ignore it and send the whole file
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {                                    // "bytes=-500": the last 500 bytes
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Number(m[2]);
  if (m[2] !== "" && end < start) return null;          // malformed ("bytes=9-3")
  if (start >= size) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

const etagMatches = (header, etag) =>
  String(header || "").split(",").some(t => t.trim().replace(/^W\//, "") === etag);

// req is Hono's c.req; file is { body, etag } from loadGuideFile.
export function bytesResponse(req, file, { type, disposition } = {}) {
  const { body, etag } = file;
  const size = body.length;
  const headers = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
    "ETag": etag,
    "X-Content-Type-Options": "nosniff",
  };
  if (disposition) headers["Content-Disposition"] = disposition;

  if (etagMatches(req.header("if-none-match"), etag)) return new Response(null, { status: 304, headers });

  // A Range request is honoured unless If-Range names a different version of the file.
  const range = req.header("range");
  const ifRange = req.header("if-range");
  if (range && (!ifRange || ifRange === etag)) {
    const r = parseRange(range, size);
    if (r === "unsatisfiable") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    if (r) {
      return new Response(body.subarray(r.start, r.end + 1), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${r.start}-${r.end}/${size}`, "Content-Length": String(r.end - r.start + 1) },
      });
    }
  }
  return new Response(body, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
