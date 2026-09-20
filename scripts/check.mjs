#!/usr/bin/env node
/**
 * check.mjs
 *
 * Offline sanity check for the no-build project:
 *   1. Syntax-check every .js/.mjs under src/ and scripts/ with `node --check`.
 *   2. Assert index.html contains the importmap (three + cannon-es), a mount
 *      element (#game or #app), and the HUD (#hud).
 *
 * Exits non-zero with a clear report on any failure. Must not rely on
 * NODE_OPTIONS (the sandbox configures a missing preload).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const failures = [];
const checked = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // directory absent is fine
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(full);
    } else if ([".js", ".mjs"].includes(extname(name))) {
      syntaxCheck(full);
    }
  }
}

function syntaxCheck(file) {
  const rel = file.replace(root + "/", "");
  try {
    // Run node itself with NODE_OPTIONS stripped so a missing preload never
    // breaks the check.
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    execFileSync(process.execPath, ["--check", file], { env, stdio: "pipe" });
    checked.push(rel);
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString() : String(err);
    failures.push(`Syntax error in ${rel}:\n${msg.trim()}`);
  }
}

function checkIndexHtml() {
  let html;
  try {
    html = readFileSync(join(root, "index.html"), "utf8");
  } catch {
    failures.push("index.html not found at project root");
    return;
  }

  const assertions = [
    { ok: /<script[^>]*type=["']importmap["']/i.test(html), msg: "index.html missing <script type=\"importmap\">" },
    { ok: /["']three["']\s*:/.test(html), msg: "importmap missing a 'three' entry" },
    { ok: /cannon-es/.test(html), msg: "importmap missing a 'cannon-es' entry" },
    { ok: /id=["'](game|app)["']/.test(html), msg: "index.html missing #game/#app mount" },
    { ok: /id=["']hud["']/.test(html), msg: "index.html missing #hud" },
    { ok: /src=["']\.\/src\/main\.js["']/.test(html), msg: "index.html does not load ./src/main.js as a module" },
    { ok: /styles\.css/.test(html), msg: "index.html does not reference styles.css" },
  ];
  for (const a of assertions) {
    if (!a.ok) failures.push(a.msg);
  }
}

walk(join(root, "src"));
walk(join(root, "scripts"));
checkIndexHtml();

console.log(`Syntax-checked ${checked.length} module(s):`);
for (const f of checked) console.log(`  ok  ${f}`);

if (failures.length > 0) {
  console.error(`\nFAILED with ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  x  ${f}`);
  process.exit(1);
}

console.log("\nindex.html: importmap (three + cannon-es), mount and #hud present.");
console.log("All checks passed.");
