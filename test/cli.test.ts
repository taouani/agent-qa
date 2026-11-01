import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli/index.js";
import { VERSION } from "../src/index.js";

describe("cli", () => {
  it("reports the package version", () => {
    expect(buildProgram().version()).toBe(VERSION);
  });

  it("lists the planned commands", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toEqual(["init", "run", "doctor", "harness", "profile", "mcp"]);
  });
});
