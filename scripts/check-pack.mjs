// Checks what `npm pack` would publish (run: npm run pack:check, after npm run build).
// Every file must match the list below, nothing secret-looking may be inside,
// and the package must stay under the size limits. Exit 1 on any problem.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The only files the package may hold. */
const ALLOWED = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^CHANGELOG\.md$/,
  /^schema\/agent-qa\.schema\.json$/,
  /^dist\/index\.(js|js\.map|d\.ts)$/,
  /^dist\/cli\/bin\.js(\.map)?$/,
  // The tsc fallback build (npm run build:tsc) writes an unbundled tree; never published, but allowed if it is.
  /^dist\/[\w./-]+\.(js|js\.map|d\.ts)$/,
];
/** Never in the package, whatever the list above allows. */
const FORBIDDEN_PATH = /^(src|test)\/|(^|\/)(\.agent-qa|\.env[^/]*)(\/|$)|\.(vault|pem|key|p12|pfx)$/i;
const FORBIDDEN_TEXT = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bnpm_[A-Za-z0-9]{36}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{60,}/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[bpas]-[A-Za-z0-9-]{10,}/,
];
const MAX_PACKED = 2 * 1024 * 1024;
const MAX_UNPACKED = 8 * 1024 * 1024;

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const [pack] = JSON.parse(execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8", shell: process.platform === "win32" }));
const problems = [];
for (const { path } of pack.files) {
  if (!ALLOWED.some((re) => re.test(path))) problems.push(`${path}: not on the package's file list (scripts/check-pack.mjs)`);
  if (FORBIDDEN_PATH.test(path)) problems.push(`${path}: never published`);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    problems.push(`${path}: can't be read`);
    continue;
  }
  for (const re of FORBIDDEN_TEXT) if (re.test(text)) problems.push(`${path}: holds something that looks like a secret (${re.source})`);
}
if (!pack.files.some((f) => f.path === "dist/cli/bin.js")) problems.push("dist/cli/bin.js is missing: run npm run build first");
if (pack.size > MAX_PACKED) problems.push(`packed size ${pack.size} bytes is over ${MAX_PACKED}`);
if (pack.unpackedSize > MAX_UNPACKED) problems.push(`unpacked size ${pack.unpackedSize} bytes is over ${MAX_UNPACKED}`);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`${pack.name}@${pack.version}: ${pack.entryCount} files, ${kb(pack.size)} packed, ${kb(pack.unpackedSize)} unpacked`);
for (const p of problems) console.error(`  ${p}`);
process.exitCode = problems.length ? 1 : 0;
