/** `mcp` module. See eslint.config.js for what it may import. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { WorkflowEngine } from "../core/index.js";
import { createMcpServer } from "./server.js";

export const MODULE = "mcp";
export { createMcpServer, LOOP_INSTRUCTIONS } from "./server.js";

/** Serve the engine over stdio, the transport IDE hosts use. Logs go to stderr only. */
export async function serveStdio(engine: WorkflowEngine): Promise<void> {
  await createMcpServer(engine).connect(new StdioServerTransport());
}
