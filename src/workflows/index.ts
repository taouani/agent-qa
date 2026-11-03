/** `workflows` module. See eslint.config.js for what it may import. */
import type { WorkflowDefinition } from "../core/index.js";
import { requirementsWorkflow } from "./requirements/workflow.js";
import { spikeWorkflow } from "./spike/workflow.js";
import { testCasesWorkflow, type TestCasesDeps } from "./test-cases/workflow.js";

export const MODULE = "workflows";
export { spikeWorkflow } from "./spike/workflow.js";
export { SPIKE_TICKETS } from "./spike/fixtures.js";
export { requirementsInputSchema, requirementsWorkflow } from "./requirements/workflow.js";
export type { RequirementsDeps, RequirementsInputs } from "./requirements/workflow.js";
export { QUALITY_GAPS, REQUIREMENTS_ARTIFACT, REQUIREMENTS_TEMPLATE_VERSION, renderRequirements, requirementsArtifactSchema } from "./requirements/artifact.js";
export type { AnalyzedRequirement, RequirementsArtifact } from "./requirements/artifact.js";
export { ISSUES_PER_BATCH, testCasesInputSchema, testCasesWorkflow } from "./test-cases/workflow.js";
export type { TestCasesDeps, TestCasesInputs } from "./test-cases/workflow.js";
export { CASE_ID, TEST_CASES_ARTIFACT, TEST_CASES_DRAFT_ARTIFACT, TEST_CASES_TEMPLATE_VERSION, testCaseSchema, testCasesSchema, XRAY_PUSH_ARTIFACT, xrayPushSchema } from "./test-cases/artifact.js";
export type { TestCase, TestCases, TestCasesDraft, XrayPush } from "./test-cases/artifact.js";

/** Every built-in workflow, registered by the front doors. The data workflows need the run store and data access. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function builtinWorkflows(deps: TestCasesDeps): ReadonlyArray<WorkflowDefinition<any>> {
  return [spikeWorkflow, requirementsWorkflow(deps), testCasesWorkflow(deps)];
}
