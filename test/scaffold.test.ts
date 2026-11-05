import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configSchema, MemoryAuditSink, RunStore, WorkflowEngine, type Mode } from "../src/core/index.js";
import { DataAccess, FRAMEWORK_PROFILE_SPEC, PROFILE_FILE, ProfileError, readSavedProfile, scanFramework } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";
import { packageName, profileWorkflow, scaffoldFiles } from "../src/workflows/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-qa-scaffold-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const PLAIN_COMMANDS = [["npx", "playwright", "test"], ["npx", "tsc", "--noEmit"]];
const BDD_COMMANDS = [["npx", "bddgen"], ...PLAIN_COMMANDS];
const exists = (p: string) => lstat(p).then(() => true, () => false);

function setup(mode?: Mode) {
  const runs = new RunStore(join(dir, ".agent-qa", "runs"));
  const audit = new MemoryAuditSink();
  const data = new DataAccess({
    root: dir,
    store: runs,
    config: configSchema.parse({ version: 1 }),
    vault: new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => Buffer.alloc(32, 3) } }),
    audit,
    ...(mode ? { mode } : {}),
  });
  const engine = new WorkflowEngine({ store: runs.stateStore({ host: "other", driver: "host-model" }), newRunId: runs.newRunId }).register(profileWorkflow({ data }));
  return { runs, data, engine, audit };
}

/** Every file under the folder, without the run folder. */
async function filesUnder(root: string, at = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(join(root, at), { withFileTypes: true })) {
    const p = at ? `${at}/${e.name}` : e.name;
    if (p === ".agent-qa") continue;
    if (e.isDirectory()) out.push(...(await filesUnder(root, p)));
    else out.push(p);
  }
  return out.sort();
}

describe("scaffold templates", () => {
  it.each(["bdd", "plain"] as const)("%s: distinct plain paths, no secret, and a package.json that scans as the style", async (style) => {
    const files = scaffoldFiles(style);
    expect(new Set(files.map((f) => f.path.toLowerCase())).size).toBe(files.length);
    for (const f of files) {
      expect(f.path).not.toMatch(/^\/|\.\.|\\/);
      expect(f.content).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY|3MVG9[A-Za-z0-9]{10,}/);
      expect(f.content).not.toMatch(/<[A-Z]+(?:_[A-Z]+)*_\d+>/);
    }
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content);
    expect(Object.keys(pkg.devDependencies)).toEqual(expect.arrayContaining(["@playwright/test", "@faker-js/faker", "typescript", "eslint"]));
    expect("playwright-bdd" in pkg.devDependencies).toBe(style === "bdd");
    for (const f of files) {
      await mkdir(join(dir, f.path, ".."), { recursive: true });
      await writeFile(join(dir, f.path), f.content);
    }
    expect(scanFramework(dir).kind).toBe(style === "bdd" ? "playwright-bdd" : "playwright");
    expect(scanFramework(dir).commands?.typecheck).toEqual(["npx", "tsc", "--noEmit"]);
    // The env file lists names only.
    for (const line of files.find((f) => f.path === ".env.example")!.content.split("\n")) if (/^SF_(CLIENT_ID|JWT_KEY|USER_\w+)=/.test(line)) expect(line).toMatch(/=$/);
  });

  it("names the package after its folder, and adds the CI workflow only at the repository root", () => {
    expect(packageName(".")).toBe("salesforce-tests");
    expect(packageName("e2e/Sales Tests")).toBe("sales-tests");
    expect(scaffoldFiles("plain").map((f) => f.path)).toContain(".github/workflows/playwright.yml");
    const nested = scaffoldFiles("plain", "e2e");
    expect(nested.map((f) => f.path)).not.toContain(".github/workflows/playwright.yml");
    expect(nested.find((f) => f.path === "README.md")!.content).toContain("isn't the project root");
  });
});

describe("profile workflow in an empty folder", () => {
  it("asks the style, then only the person's yes creates the repo and saves its profile", async () => {
    const { engine, runs, audit } = setup();
    const style = await engine.start("profile", {});
    expect(style).toMatchObject({ stepId: "style", kind: "confirm" });
    const scaffold = (await engine.submit(style.runId, "style", { bdd: true })).next;
    expect(scaffold).toMatchObject({ stepId: "scaffold", kind: "confirm" });
    expect(scaffold.kind === "confirm" && scaffold.context).toContain("tests/features/smoke.feature");
    expect((await engine.approval(style.runId, "scaffold"))?.question).toMatch(/^Start a new Playwright repo \(Gherkin features with playwright-bdd\) in the project root\? Agent-QA creates up to \d+ files and replaces none \(an existing README\.md is kept, an existing \.gitignore only gains lines\), then saves agent-qa\.profile\.json, so it may then run: npx bddgen; npx playwright test; npx tsc --noEmit\.$/);

    // The host model's yes alone is refused.
    await expect(engine.submit(style.runId, "scaffold", { create: true })).rejects.toThrow(/Only the user can approve scaffold/);
    expect(await filesUnder(dir)).toEqual([]);
    expect((await engine.submit(style.runId, "scaffold", { create: true }, { byPerson: true })).next.kind).toBe("done");

    expect(await filesUnder(dir)).toEqual([...scaffoldFiles("bdd").map((f) => f.path), PROFILE_FILE].sort());
    for (const f of scaffoldFiles("bdd")) expect(await readFile(join(dir, f.path), "utf8")).toBe(f.content);
    expect(readSavedProfile(dir)).toMatchObject({ folder: ".", kind: "playwright-bdd", commands: { generate: ["npx", "bddgen"], test: ["npx", "playwright", "test"], typecheck: ["npx", "tsc", "--noEmit"] } });
    expect(audit.entries.some((e) => e.target === "testCode")).toBe(true);
    // The scan the person saw is kept, from before the files existed.
    expect((await runs.readArtifact(style.runId, FRAMEWORK_PROFILE_SPEC))?.data.kind).toBe("empty");
  });

  it("skips the style question when the inputs name one, and a no writes nothing", async () => {
    const { engine } = setup();
    const step = await engine.start("profile", { style: "plain" });
    expect(step.stepId).toBe("scaffold");
    expect((await engine.approval(step.runId, "scaffold"))?.question).toContain("plain Playwright specs");
    expect((await engine.submit(step.runId, "scaffold", { create: false })).next.kind).toBe("done");
    expect(await filesUnder(dir)).toEqual([]);

    const plain = await engine.start("profile", { style: "plain" });
    await engine.submit(plain.runId, "scaffold", { create: true }, { byPerson: true });
    expect(await exists(join(dir, "tests/smoke.spec.ts"))).toBe(true);
    expect(await exists(join(dir, "tests/features"))).toBe(false);
    expect(readSavedProfile(dir)?.kind).toBe("playwright");
  });

  it("starts one in a named subfolder, with the profile at the project root", async () => {
    await mkdir(join(dir, "e2e"));
    const { engine } = setup();
    const step = await engine.start("profile", { folder: "e2e", style: "bdd" });
    await engine.submit(step.runId, "scaffold", { create: true }, { byPerson: true });
    expect(JSON.parse(await readFile(join(dir, "e2e/package.json"), "utf8")).name).toBe("e2e");
    expect(readSavedProfile(dir)).toMatchObject({ folder: "e2e", kind: "playwright-bdd" });
    expect(await exists(join(dir, "e2e/.github"))).toBe(false);
  });

  it("offers no new repo where one can't go, and says why", async () => {
    // A package.json without Playwright: the folder isn't empty.
    await writeFile(join(dir, "package.json"), "{}");
    const { engine } = setup();
    const step = await engine.start("profile", {});
    expect(step.stepId).toBe("review");
    expect((await engine.approval(step.runId, "review"))?.question).toBe(
      "There is no Playwright project in ., so there is nothing to save, and no new one can start there (the folder already has package.json: a new repo only goes into a folder without them). Close this run?",
    );
    await rm(join(dir, "package.json"));

    // Any file the repo would replace.
    await writeFile(join(dir, "tsconfig.json"), "{}");
    expect((await setup().engine.start("profile", {})).stepId).toBe("review");
    await rm(join(dir, "tsconfig.json"));

    // CI never starts one.
    const ci = setup("ci");
    const inCi = await ci.engine.start("profile", {});
    expect(inCi.stepId).toBe("review");
    expect((await ci.engine.approval(inCi.runId, "review"))?.question).toContain("never in CI");
    expect(await filesUnder(dir)).toEqual([]);
  });

  it("starts one after agent-qa init: an existing README.md is kept and .gitignore gains only its missing lines", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\n");
    await writeFile(join(dir, ".gitignore"), "# Agent-QA\n.agent-qa/\nnode_modules/\n");
    await writeFile(join(dir, "README.md"), "# Ours\n");
    await mkdir(join(dir, ".vscode"));
    await writeFile(join(dir, ".vscode/mcp.json"), "{}");
    const { engine } = setup();
    const step = await engine.start("profile", {});
    expect(step.stepId).toBe("style");
    const scaffold = (await engine.submit(step.runId, "style", { bdd: false })).next;
    expect(scaffold.kind === "confirm" && scaffold.context).toContain("README.md (");
    expect(scaffold.kind === "confirm" && scaffold.context).toMatch(/README\.md \(\d+ lines\), kept if it exists/);
    await engine.submit(step.runId, "scaffold", { create: true }, { byPerson: true });
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe("# Ours\n");
    const ignore = await readFile(join(dir, ".gitignore"), "utf8");
    expect(ignore.startsWith("# Agent-QA\n.agent-qa/\nnode_modules/\n")).toBe(true);
    expect(ignore).toContain(".env\n");
    expect(ignore.match(/^node_modules\/$/gm)).toHaveLength(1);
    expect(readSavedProfile(dir)?.kind).toBe("playwright");
  });

  it("finishes a yes given again after a crash that left the files and the profile", async () => {
    const { engine, data } = setup();
    const step = await engine.start("profile", { style: "plain" });
    // The files and the profile were written, then the process died before the step was saved.
    await data.scaffoldRepo(step.runId, undefined, "playwright", (f) => scaffoldFiles("plain", f), PLAIN_COMMANDS, true);
    const before = await readFile(join(dir, PROFILE_FILE), "utf8");
    expect((await engine.submit(step.runId, "scaffold", { create: true }, { byPerson: true })).next.kind).toBe("done");
    expect(await readFile(join(dir, PROFILE_FILE), "utf8")).toBe(before);
  });

  it("still opens the review over a broken saved profile, and saving repairs it", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ devDependencies: { "@playwright/test": "^1.58.0" } }));
    await writeFile(join(dir, PROFILE_FILE), "{ broken");
    const { engine } = setup();
    const step = await engine.start("profile", {});
    expect(step.stepId).toBe("review");
    await engine.submit(step.runId, "review", { approve: true }, { byPerson: true });
    expect(readSavedProfile(dir)?.kind).toBe("playwright");
  });

  it("refuses a file that appeared after the question, before writing anything", async () => {
    const { engine } = setup();
    const step = await engine.start("profile", { style: "plain" });
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src/fixtures.ts"), "// the person's own");
    await expect(engine.submit(step.runId, "scaffold", { create: true }, { byPerson: true })).rejects.toThrow(/src\/fixtures\.ts/);
    expect(await filesUnder(dir)).toEqual(["src/fixtures.ts"]);
    expect(readSavedProfile(dir)).toBeUndefined();
  });
});

describe("data.scaffoldRepo", () => {
  it("removes every file it created when the new repo doesn't read as the kind asked", async () => {
    const { data, runs } = setup();
    const runId = runs.newRunId("profile", {});
    await runs.stateStore({ host: "other", driver: "host-model" }).save({ runId, workflowId: "profile", status: "running", inputs: {}, stepIndex: 0, attempt: 1, outputs: {}, accepted: {}, createdAt: "", updatedAt: "" });
    await expect(data.scaffoldRepo(runId, undefined, "playwright", (f) => scaffoldFiles("bdd", f), PLAIN_COMMANDS, true)).rejects.toThrow(ProfileError);
    await expect(data.scaffoldRepo(runId, undefined, "playwright", (f) => scaffoldFiles("bdd", f), PLAIN_COMMANDS, true)).rejects.toThrow(/reads as playwright-bdd, not playwright\)\. Nothing was left behind/);
    expect(await filesUnder(dir)).toEqual([]);
  });

  it("puts back a .gitignore it added lines to when the write fails", async () => {
    const { data, runs } = setup();
    const runId = runs.newRunId("profile", {});
    await runs.stateStore({ host: "other", driver: "host-model" }).save({ runId, workflowId: "profile", status: "running", inputs: {}, stepIndex: 0, attempt: 1, outputs: {}, accepted: {}, createdAt: "", updatedAt: "" });
    await writeFile(join(dir, ".gitignore"), "dist/");
    await expect(data.scaffoldRepo(runId, undefined, "playwright", (f) => scaffoldFiles("bdd", f), PLAIN_COMMANDS, true)).rejects.toThrow(/Nothing was left behind/);
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toBe("dist/");
    expect(await filesUnder(dir)).toEqual([".gitignore"]);
  });

  it("refuses commands other than the ones the person was shown", async () => {
    const { data, runs } = setup();
    const runId = runs.newRunId("profile", {});
    await runs.stateStore({ host: "other", driver: "host-model" }).save({ runId, workflowId: "profile", status: "running", inputs: {}, stepIndex: 0, attempt: 1, outputs: {}, accepted: {}, createdAt: "", updatedAt: "" });
    await expect(data.scaffoldRepo(runId, undefined, "playwright", (f) => scaffoldFiles("plain", f), BDD_COMMANDS, true)).rejects.toThrow(/not the ones you were shown/);
    expect(await filesUnder(dir)).toEqual([]);
  });

  it("never replaces a profile saved meanwhile", async () => {
    const { data, runs } = setup();
    const runId = runs.newRunId("profile", {});
    await runs.stateStore({ host: "other", driver: "host-model" }).save({ runId, workflowId: "profile", status: "running", inputs: {}, stepIndex: 0, attempt: 1, outputs: {}, accepted: {}, createdAt: "", updatedAt: "" });
    const other = JSON.stringify({ version: 1, folder: ".", kind: "playwright", commands: { test: ["npx", "playwright", "test"] }, reviewedAt: "2026-11-01T00:00:00.000Z" });
    await writeFile(join(dir, PROFILE_FILE), other);
    await expect(data.scaffoldRepo(runId, undefined, "playwright", (f) => scaffoldFiles("plain", f), PLAIN_COMMANDS, true)).rejects.toThrow(/exists already/);
    expect(await readFile(join(dir, PROFILE_FILE), "utf8")).toBe(other);
    expect(await filesUnder(dir)).toEqual([PROFILE_FILE]);
  });

  it("refuses paths outside a new repo, and masking tokens", async () => {
    const { data } = setup();
    const one = (path: string, content = "x") => () => [{ path: "package.json", content: "{}" }, { path, content }];
    for (const bad of ["../out.txt", ".git/config", "node_modules/x.js", PROFILE_FILE, ".agent-qa/x"]) await expect(data.scaffoldRepo("r", undefined, "playwright", one(bad), PLAIN_COMMANDS, true)).rejects.toThrow(ProfileError);
    await expect(data.scaffoldRepo("r", undefined, "playwright", one("a.ts", "hi <PERSON_1>"), PLAIN_COMMANDS, true)).rejects.toThrow(/masking token/);
    expect(await data.scaffoldRepo("r", undefined, "playwright", one("a.ts"), PLAIN_COMMANDS, false)).toEqual({ status: "declined" });
    expect(await filesUnder(dir)).toEqual([]);
  });
});

describe("agent-qa profile in an empty folder", () => {
  it("says how to start a repo, with the folder and the style in one --input", async () => {
    const { profileCommand } = await import("../src/cli/index.js");
    await mkdir(join(dir, "e2e"));
    let out = "";
    profileCommand({ root: dir, folder: "e2e", json: false }, (s) => (out += s), () => {});
    expect(out).toContain(`agent-qa run profile --accept scaffold --input '{"folder":"e2e"}'`);
    expect(out).toContain(`--input '{"folder":"e2e","style":"plain"}'`);
    // Not where one can't start.
    await writeFile(join(dir, "e2e/package.json"), "{}");
    out = "";
    profileCommand({ root: dir, folder: "e2e", json: false }, (s) => (out += s), () => {});
    expect(out).not.toContain("--accept scaffold");
  });
});

describe("agent-qa run profile in an empty folder", () => {
  it("creates the BDD repo on --yes --accept scaffold, and --yes alone creates nothing", async () => {
    const { runCommand, EXIT } = await import("../src/cli/run.js");
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\n");
    const lines: string[] = [];
    const vault = new Vault({ storage: new MemoryVaultStorage(), keys: { description: "t", getKey: async () => Buffer.alloc(32, 4) } });
    const base = { root: dir, env: {}, log: (l: string) => lines.push(l), ask: false as const, data: (b: ConstructorParameters<typeof DataAccess>[0]) => new DataAccess({ ...b, vault }) };
    expect(await runCommand({ ...base, workflow: "profile", yes: true })).toBe(EXIT.done);
    expect(lines.join("\n")).toContain("scaffold: declined");
    expect(await exists(join(dir, "package.json"))).toBe(false);
    // Without --yes, the style question waits for an answer.
    expect(await runCommand({ ...base, workflow: "profile", accept: ["scaffold"] })).toBe(EXIT.waiting);
    expect(await exists(join(dir, "package.json"))).toBe(false);
    expect(await runCommand({ ...base, workflow: "profile", yes: true, accept: ["scaffold"] })).toBe(EXIT.done);
    expect(readSavedProfile(dir)?.kind).toBe("playwright-bdd");
    expect(await exists(join(dir, "tests/features/smoke.feature"))).toBe(true);
  });
});
