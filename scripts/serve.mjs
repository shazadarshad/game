#!/usr/bin/env node
/**
 * serve.mjs
 *
 * Zero-dependency static file server for local play and verification. Serves
 * the project root over HTTP with correct MIME types (notably
 * application/javascript for .js/.mjs so ES modules load).
 *
 * Usage: node scripts/serve.mjs [port]   (default port 8080, or PORT env var)
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const port = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function safeResolve(urlPath) {
  // Strip query/hash, decode, and prevent path traversal outside root.
  let p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  if (p === "/" || p === "") p = "/index.html";
  const resolved = normalize(join(root, p));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = createServer(async (req, res) => {
  const filePath = safeResolve(req.url || "/");
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, "index.html") : filePath;
    const body = await readFile(target);
    const type = MIME[extname(target).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
});

server.listen(port, () => {
  console.log(`Apex Circuit static server running at http://localhost:${port}/`);
  console.log("Press Ctrl+C to stop.");
});
