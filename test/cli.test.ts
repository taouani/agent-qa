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
    expect(names).toEqual(["init", "run", "doctor", "harness", "profile", "mcp"]);
  });

  it("keeps run state in AGENT_QA_STATE_DIR when set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-cli-"));
    try {
      const engine = createEngine("/nonexistent", { AGENT_QA_STATE_DIR: dir });
      await engine.start("spike-test-cases", { ticket: "SPIKE-1" });
      expect((await readdir(dir)).some((f) => f.endsWith(".state.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
