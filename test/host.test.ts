import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHostCommand } from "../src/connectors/host.js";
import { configSchema, MemoryAuditSink, Policy, PolicyDenied, RunStore, type WriteGrant } from "../src/core/index.js";
import { checkHostCommand, DataAccess, HostCommandRefused, hostCwd, hostEnv } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

const NODE = process.execPath;
const rules = { xray: "ask", confluence: "ask", testCode: "ask", jira: "deny", commands: "allow" } as const;

async function withGrant<T>(fn: (g: WriteGrant) => Promise<T>): Promise<T> {
  const policy = new Policy({ rules, mode: "ide", audit: new MemoryAuditSink() });
  const outcome = await policy.guard({ target: "commands", summary: "test" }, fn);
  if (outcome.status !== "done") throw new Error("declined");
  return outcome.value;
}

/** Starts a process in its own session that holds stdout for 30 s, and prints its pid to stderr. */
const LEFTOVER = `const c = require("child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { detached: true, stdio: ["ignore", "inherit", "inherit"] }); c.unref(); console.error("leftover:" + c.pid)`;
function endLeftover(stderr: string): void {
  const pid = Number(/leftover:(\d+)/.exec(stderr)?.[1]);
  try {
    if (pid) process.kill(pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

const base = { cwd: process.cwd(), env: process.env, timeoutMs: 20_000, maxOutputBytes: 64 * 1024 };

describe("runHostCommand (S2-1)", () => {
  it("runs a program without a shell and keeps its output and exit code", async () => {
    const r = await withGrant((g) => runHostCommand(g, { ...base, argv: [NODE, "-e", "console.log('a & b'); console.error('oops'); process.exit(3)"] }));
    expect(r).toMatchObject({ exitCode: 3, timedOut: false, aborted: false, truncated: false });
    expect(r.stdout.trim()).toBe("a & b");
    expect(r.stderr.trim()).toBe("oops");
  });

  it("passes an argument with shell syntax as plain text", async () => {
    const r = await withGrant((g) => runHostCommand(g, { ...base, argv: [NODE, "-e", "console.log(process.argv[1])", "x;echo hacked"] }));
    expect(r.stdout.trim()).toBe("x;echo hacked");
  });

  it("kills a command that runs too long", async () => {
    const r = await withGrant((g) => runHostCommand(g, { ...base, timeoutMs: 500, argv: [NODE, "-e", "setTimeout(() => {}, 60000)"] }));
    expect(r).toMatchObject({ exitCode: null, timedOut: true });
    expect(r.durationMs).toBeLessThan(15_000);
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const r = await withGrant((g) => runHostCommand(g, { ...base, signal: controller.signal, argv: [NODE, "-e", "setTimeout(() => {}, 60000)"] }));
    expect(r).toMatchObject({ exitCode: null, aborted: true });
  });

  it("keeps only the end of long output", async () => {
    const r = await withGrant((g) => runHostCommand(g, { ...base, maxOutputBytes: 100, argv: [NODE, "-e", "process.stdout.write('x'.repeat(5000) + 'END')"] }));
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBe(100);
    expect(r.stdout.endsWith("END")).toBe(true);
  });

  it("refuses to run without a commands grant", async () => {
    await expect(runHostCommand(undefined as unknown as WriteGrant, { ...base, argv: [NODE, "-v"] })).rejects.toBeInstanceOf(PolicyDenied);
    const policy = new Policy({ rules: { ...rules, testCode: "allow" }, mode: "ide", audit: new MemoryAuditSink() });
    await expect(policy.guard({ target: "testCode", summary: "x" }, (g) => runHostCommand(g, { ...base, argv: [NODE, "-v"] }))).rejects.toBeInstanceOf(PolicyDenied);
  });

  it("reports the real exit code and returns when a leftover process keeps the output open", async () => {
    // The child exits at once; its own child, in a new session, holds stdout for 30 s.
    const script = `${LEFTOVER}; console.log("bye")`;
    const r = await withGrant((g) => runHostCommand(g, { ...base, timeoutMs: 20_000, argv: [NODE, "-e", script] }));
    endLeftover(r.stderr);
    expect(r).toMatchObject({ exitCode: 0, timedOut: false });
    expect(r.stdout).toContain("bye");
    expect(r.durationMs).toBeLessThan(10_000);
  });

  it("keeps the time limit when a leftover process keeps the output open", async () => {
    const script = `${LEFTOVER}; setTimeout(() => {}, 60000)`;
    const r = await withGrant((g) => runHostCommand(g, { ...base, timeoutMs: 500, argv: [NODE, "-e", script] }));
    endLeftover(r.stderr);
    expect(r).toMatchObject({ exitCode: null, timedOut: true });
    expect(r.durationMs).toBeLessThan(10_000);
  });

  it.skipIf(process.platform === "win32")("kills a process that ignores SIGTERM after the grace period", async () => {
    // A member of the program's group that ignores SIGTERM and doesn't hold the output pipes.
    const stubborn = `const c = require("child_process").spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setTimeout(() => {}, 30000)"], { stdio: "ignore" }); console.error("leftover:" + c.pid); setTimeout(() => {}, 60000)`;
    const r = await withGrant((g) => runHostCommand(g, { ...base, timeoutMs: 1_000, argv: [NODE, "-e", stubborn] }));
    const pid = Number(/leftover:(\d+)/.exec(r.stderr)?.[1]);
    expect(pid).toBeGreaterThan(0);
    const alive = () => {
      try {
        process.kill(pid, 0);
      } catch {
        return false;
      }
      // A killed process that init hasn't reaped yet is a zombie (state Z): dead.
      try {
        return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
      } catch {
        return true; // no /proc (macOS)
      }
    };
    await new Promise((done) => setTimeout(done, 4_500));
    const survived = alive();
    endLeftover(r.stderr);
    expect(survived).toBe(false);
  }, 15_000);

  it("says when the program isn't installed", async () => {
    await expect(withGrant((g) => runHostCommand(g, { ...base, argv: ["agent-qa-no-such-program-x1"] }))).rejects.toThrow(/was not found/);
  });
});

describe("host command checks", () => {
  const allowed = [["npx", "playwright", "test"], ["npx", "bddgen"]];

  it("allows only the profile's commands, exactly", () => {
    expect(checkHostCommand({ command: ["npx", "bddgen"], purpose: "p" }, allowed)).toEqual(["npx", "bddgen"]);
    expect(() => checkHostCommand({ command: ["npx", "playwright"], purpose: "p" }, allowed)).toThrow(HostCommandRefused);
    expect(() => checkHostCommand({ command: ["rm", "-rf", "/"], purpose: "p" }, allowed)).toThrow(/not a command the framework profile lists/);
  });

  it("allows paths inside the project and known flags only", () => {
    const run = (args: string[]) => checkHostCommand({ command: ["npx", "playwright", "test"], args, purpose: "p" }, allowed);
    expect(run(["tests/features/Returns_Refund-above-store-limit.feature", "--reporter=json", "--retries=0", "--workers=1", "--grep=@P1 and @smoke"])).toHaveLength(8);
    expect(run(["--reporter=list,json"])).toHaveLength(4);
    const badArgs = [
      ...["../secret.ts", "/etc/passwd", "C:\\Windows\\x", "\\\\host\\share\\x", "a&b", "a|b", "%PATH%", "a b", "--config=evil.ts", "--grep=\"x\"", "-c", "x^y", "a\nb"],
      // A flag value is a path too, and a reporter only a built-in one: a path would load code from anywhere.
      ...["--reporter=./evil.js", "--reporter=/tmp/x.js", "--reporter=../../x.js", "--reporter=\\\\host@SSL\\share\\r.js", "--reporter=list,./x.js", "--project=../other", "--project=/etc", "--project=C:x"],
    ];
    for (const bad of badArgs) {
      expect(() => run([bad]), bad).toThrow(HostCommandRefused);
    }
  });

  describe("folders", () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "agent-qa-host-"));
      await mkdir(join(dir, "e2e"));
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it("runs only in a folder inside the project", () => {
      expect(hostCwd(dir, "e2e")).toBe(join(dir, "e2e"));
      expect(hostCwd(dir)).toBe(join(dir));
      expect(() => hostCwd(dir, "..")).toThrow(/outside the project/);
      expect(() => hostCwd(dir, "e2e/../../x")).toThrow(/outside the project/);
      expect(() => hostCwd(dir, "missing")).toThrow(/not a folder/);
    });

    it("refuses a folder that links outside the project, and allows a name starting with ..", async () => {
      const elsewhere = await mkdtemp(join(tmpdir(), "agent-qa-elsewhere-"));
      try {
        await symlink(elsewhere, join(dir, "linked"), "dir");
        expect(() => hostCwd(dir, "linked")).toThrow(/links outside the project/);
      } finally {
        await rm(elsewhere, { recursive: true, force: true });
      }
      await mkdir(join(dir, "..e2e"));
      expect(hostCwd(dir, "..e2e")).toBe(join(dir, "..e2e"));
    });
  });

  it("drops Agent-QA's own secrets, stops npx installing packages, and turns colour off", () => {
    const config = configSchema.parse({ version: 1, atlassian: { site: "https://acme.atlassian.net", email: "${env:ATL_EMAIL}", token: "${env:ATL_TOKEN}" } });
    const env = hostEnv({ PATH: "/bin", ATL_TOKEN: "t", ATL_EMAIL: "e", ANTHROPIC_API_KEY: "k", SF_USERNAME: "u", AGENT_QA_VAULT_KEY: "v", AGENT_QA_OTHER: "o", NPM_CONFIG_YES: "true" }, config);
    expect(env).toEqual({ PATH: "/bin", SF_USERNAME: "u", npm_config_yes: "false", FORCE_COLOR: "0", NO_COLOR: "1" });
  });
});

describe("DataAccess.runCommand", () => {
  let dir: string;
  const vaults = new MemoryVaultStorage();
  const key = Buffer.alloc(32, 7);
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-hostdata-"));
    await writeFile(join(dir, "say.js"), "console.log('Contact jane.doe@example.com'); process.exit(1)");
    const profile = { version: 1, folder: ".", kind: "playwright", commands: { test: [NODE, "say.js"] }, reviewedAt: "2026-11-04T00:00:00.000Z" };
    await writeFile(join(dir, "agent-qa.profile.json"), JSON.stringify(profile));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  function data(over: { mode?: "ide" | "ci"; commands?: "allow" | "ask" | "deny"; audit?: MemoryAuditSink } = {}) {
    return new DataAccess({
      root: dir,
      store: new RunStore(join(dir, "runs")),
      config: configSchema.parse({ version: 1, policy: { writes: { commands: over.commands ?? "ask" } } }),
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      audit: over.audit ?? new MemoryAuditSink(),
      ...(over.mode ? { mode: over.mode } : {}),
    });
  }
  const request = { command: [NODE, "say.js"], purpose: "Run the generated specs" };

  it("runs an approved command, masks its output and audits it", async () => {
    const audit = new MemoryAuditSink();
    const outcome = await data({ audit }).runCommand("run-1", request, true);
    expect(outcome.status).toBe("done");
    if (outcome.status !== "done") return;
    expect(outcome.result.exitCode).toBe(1);
    expect(outcome.result.stdout).not.toContain("jane.doe@example.com");
    expect(outcome.result.stdout).toMatch(/Contact <EMAIL_\d+>/);
    expect(audit.entries.map((e) => [e.target, e.outcome])).toEqual([["commands", "approved"], ["commands", "done"]]);
    // The audit names the command's program, never the arguments.
    expect(audit.entries[0]!.summary).not.toContain("jane.doe");
  });

  it("runs nothing when the user said no", async () => {
    const audit = new MemoryAuditSink();
    expect(await data({ audit }).runCommand("run-1", request, false)).toEqual({ status: "declined" });
    expect(audit.entries).toEqual([]);
  });

  it("refuses a command the profile doesn't list before asking or logging", async () => {
    const audit = new MemoryAuditSink();
    await expect(data({ audit }).runCommand("run-1", { command: [NODE, "-v"], purpose: "p" }, true)).rejects.toBeInstanceOf(HostCommandRefused);
    expect(audit.entries).toEqual([]);
  });

  it("runs only what agent-qa.profile.json lists, and nothing without one", async () => {
    await expect(data().runCommand("run-1", { ...request, command: [NODE, "other.js"] }, true)).rejects.toThrow(/not a command the framework profile lists/);
    await rm(join(dir, "agent-qa.profile.json"));
    await expect(data().runCommand("run-1", request, true)).rejects.toThrow(/no reviewed framework profile/);
    await writeFile(join(dir, "agent-qa.profile.json"), "{ not json");
    await expect(data().runCommand("run-1", request, true)).rejects.toThrow(/not valid JSON/);
  });

  it("stops on a broken agent-qa.yaml instead of using the default rules", async () => {
    await writeFile(join(dir, "agent-qa.yaml"), "version: 1\npolicy:\n  writes:\n    commands: Deny\n");
    const loose = new DataAccess({
      root: dir,
      store: new RunStore(join(dir, "runs")),
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      audit: new MemoryAuditSink(),
      mode: "ci",
    });
    await expect(loose.runCommand("run-1", request, true)).rejects.toThrow(/Invalid config/);
  });

  it("obeys a deny rule, in CI too, and runs unasked in CI otherwise", async () => {
    await expect(data({ commands: "deny" }).runCommand("run-1", request, true)).rejects.toBeInstanceOf(PolicyDenied);
    await expect(data({ mode: "ci", commands: "deny" }).runCommand("run-1", request, true)).rejects.toBeInstanceOf(PolicyDenied);
    expect((await data({ mode: "ci" }).runCommand("run-1", request, true)).status).toBe("done");
  });
});
