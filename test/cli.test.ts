import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProgram, createEngine } from "../src/cli/index.js";
import { VERSION } from "../src/index.js";

describe("cli", () => {
  it("reports the package version", () => {
    expect(buildProgram().version()).toBe(VERSION);
  });

  it("lists the planned commands", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toEqual(["init", "run", "profile", "doctor", "harness", "mcp"]);
  });

  it("gives each run a folder under AGENT_QA_RUNS_DIR when set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-cli-"));
    try {
      const engine = createEngine("/nonexistent", { AGENT_QA_RUNS_DIR: dir });
      expect(engine.list().map((w) => w.id)).toEqual(["requirements", "test-cases", "profile", "explore"]);
      // No agent-qa.yaml there, so Jira can't be read: the run is saved, and its first step waits.
      await expect(engine.start("requirements", { key: "ABC-1" })).rejects.toThrow();
      const [runId, ...more] = await readdir(dir);
      expect(more).toEqual([]);
      expect(runId).toMatch(/^\d{4}-\d{2}-\d{2}-ABC-1-[a-z0-9]{4}$/);
      expect((await readdir(join(dir, runId!))).sort()).toEqual(["run.json", "steps"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs doctor with --json and --offline, and sets the exit code", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-cli-"));
    const out: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (out.push(String(chunk)), true));
    const before = process.exitCode;
    try {
      await buildProgram().parseAsync(["node", "agent-qa", "doctor", "--offline", "--json", "--cwd", dir]);
      const results = JSON.parse(out.join("")) as Array<{ id: string; status: string }>;
      expect(results.find((r) => r.id === "config")?.status).toBe("fail");
      expect(results.find((r) => r.id === "network")?.status).toBe("skip");
      expect(process.exitCode).toBe(1);

      process.exitCode = undefined;
      out.length = 0;
      await writeFile(join(dir, "agent-qa.yaml"), "version: 1\n");
      await writeFile(join(dir, ".gitignore"), ".agent-qa/\n");
      await buildProgram().parseAsync(["node", "agent-qa", "doctor", "--offline", "--cwd", dir]);
      expect(out.join("")).toMatch(/\[ok {2}\] agent-qa.yaml: agent-qa.yaml/);
      expect(process.exitCode).toBeUndefined();
    } finally {
      write.mockRestore();
      process.exitCode = before;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
