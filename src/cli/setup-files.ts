import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * The only disk writes outside the run store, vault and audit log that skip
 * the policy layer: the project setup files `agent-qa init` writes when the
 * user runs it. Only these paths, never run data or model output.
 */
export const SETUP_FILES = ["agent-qa.yaml", ".vscode/mcp.json", ".gitignore"] as const;
export type SetupFile = (typeof SETUP_FILES)[number];

/**
 * Writes one setup file. `create` fails if it exists (so a file made between
 * init's check and its write is never overwritten); `replace` overwrites.
 */
export async function writeSetupFile(root: string, file: SetupFile, text: string, how: "create" | "replace"): Promise<void> {
  if (!SETUP_FILES.includes(file)) throw new Error(`Not a setup file: ${String(file)}`);
  const path = join(root, ...file.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, { flag: how === "create" ? "wx" : "w" });
}
