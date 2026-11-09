// Installs the packed package into an empty project, the way a new user would,
// and times each step (run in CI: node scripts/install-smoke.mjs <file.tgz>).
// Checks that `agent-qa --version` matches, `init` writes a valid setup with nobody
// to ask, `doctor --offline` runs, and the offline harness passes. Exit 1 on any failure.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tgz = process.argv[2] && resolve(process.argv[2]);
if (!tgz) {
  console.error("usage: node scripts/install-smoke.mjs <sf-agent-qa-x.y.z.tgz>");
  process.exit(2);
}
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const win = process.platform === "win32";
const project = mkdtempSync(join(tmpdir(), "agent-qa-install-"));
writeFileSync(join(project, "package.json"), JSON.stringify({ name: "fresh-project", private: true }));
// Nobody to ask, and no CI default that changes init: the same as a script on a laptop.
const env = { ...process.env, CI: "" };
const times = [];
let failed = false;

function step(name, cmd, args, check, input) {
  const start = Date.now();
  const r = spawnSync(cmd, args, { cwd: project, env, encoding: "utf8", shell: win, timeout: 300_000, ...(input === undefined ? {} : { input }) });
  const ms = Date.now() - start;
  let problem = r.error ? r.error.message : undefined;
  if (!problem) problem = check(r);
  times.push([name, ms, problem]);
  console.log(`${problem ? "FAIL" : "ok  "} ${name} (${(ms / 1000).toFixed(1)} s)${problem ? `: ${problem}` : ""}`);
  if (problem) {
    failed = true;
    if (r.stdout) console.log(r.stdout.slice(-2000));
    if (r.stderr) console.error(r.stderr.slice(-2000));
  }
  return r;
}

const npm = win ? "npm.cmd" : "npm";
// The installed bin itself, never npx: npx would fetch another package if the install failed.
const bin = join(project, "node_modules", ".bin", win ? "agent-qa.cmd" : "agent-qa");
step("npm install", npm, ["install", "--no-audit", "--no-fund", tgz], (r) => (r.status === 0 ? undefined : `exit ${r.status}`));
step("agent-qa --version", bin, ["--version"], (r) => (r.stdout.trim() === version ? undefined : `printed ${JSON.stringify(r.stdout.trim())}, expected ${version}`));
step("agent-qa init", bin, ["init", "--site", "acme", "--xray-project", "QA"], (r) => {
  if (r.status !== 0) return `exit ${r.status}`;
  const config = readFileSync(join(project, "agent-qa.yaml"), "utf8");
  if (!config.includes("site: https://acme.atlassian.net")) return "agent-qa.yaml doesn't have the site";
  if (!r.stderr.includes("Next:")) return "no next steps printed";
  return undefined;
});
step("agent-qa doctor --offline", bin, ["doctor", "--offline", "--json"], (r) => {
  // Exit 1 is expected: no secrets are set here.
  let results;
  try {
    results = JSON.parse(r.stdout);
  } catch {
    return `not JSON (exit ${r.status})`;
  }
  const config = results.find((c) => c.id === "config");
  return config?.status === "pass" ? undefined : `config check: ${config?.status ?? "missing"}`;
});
step("agent-qa harness", bin, ["harness"], (r) => (r.status === 0 ? undefined : `exit ${r.status}`));
// The MCP server answers an initialize request on stdio, then exits when stdin closes.
const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "install-smoke", version: "1" } } };
step("agent-qa mcp (initialize)", bin, ["mcp"], (r) => {
  const reply = r.stdout.split("\n").map((l) => { try { return JSON.parse(l); } catch { return undefined; } }).find((m) => m?.id === 1);
  return reply?.result?.serverInfo ? undefined : `no initialize result (exit ${r.status})`;
}, JSON.stringify(initialize) + "\n");
// The public API, as a library user imports it.
step("import sf-agent-qa", process.execPath, ["--input-type=module", "-e", "const m = await import('sf-agent-qa'); console.log(m.VERSION);"], (r) => (r.stdout.trim() === version ? undefined : `VERSION is ${JSON.stringify(r.stdout.trim())} (exit ${r.status})`));

const total = times.reduce((n, [, ms]) => n + ms, 0);
console.log(`total ${(total / 1000).toFixed(1)} s on ${process.platform}, node ${process.version}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = times.map(([name, ms, problem]) => `| ${name} | ${(ms / 1000).toFixed(1)} s | ${problem ? `FAIL: ${problem}` : "ok"} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`### Fresh install, ${process.platform}, node ${process.version}`, "", "| Step | Time | Result |", "|---|---|---|", ...rows, `| total | ${(total / 1000).toFixed(1)} s | |`, ""].join("\n") + "\n");
}
try {
  rmSync(project, { recursive: true, force: true });
} catch {
  // A temp folder left behind is harmless.
}
process.exitCode = failed ? 1 : 0;
