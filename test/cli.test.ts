import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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
    expect(names).toEqual(["init", "run", "harness", "profile", "doctor", "mcp"]);
  });

  it("gives each run a folder under AGENT_QA_RUNS_DIR when set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-cli-"));
    try {
      const engine = createEngine("/nonexistent", { AGENT_QA_RUNS_DIR: dir });
      const step = await engine.start("spike-test-cases", { ticket: "SPIKE-1" });
      expect(step.runId).toMatch(/^\d{4}-\d{2}-\d{2}-SPIKE-1-[a-z0-9]{4}$/);
      expect((await readdir(join(dir, step.runId))).sort()).toEqual(["run.json", "steps"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
