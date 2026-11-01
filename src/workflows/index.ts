/** `workflows` module. See eslint.config.js for what it may import. */
import type { WorkflowDefinition } from "../core/index.js";
import { spikeWorkflow } from "./spike/workflow.js";

export const MODULE = "workflows";
export { spikeWorkflow } from "./spike/workflow.js";
export { SPIKE_TICKETS } from "./spike/fixtures.js";

/** Every built-in workflow, registered by the front doors. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builtinWorkflows: ReadonlyArray<WorkflowDefinition<any>> = [spikeWorkflow];
