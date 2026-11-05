/** `workflows` module. See eslint.config.js for what it may import. */
import type { WorkflowDefinition } from "../core/index.js";
import { requirementsWorkflow } from "./requirements/workflow.js";
import { testCasesWorkflow, type TestCasesDeps } from "./test-cases/workflow.js";
import { profileWorkflow, type ProfileDeps } from "./profile/workflow.js";
import { exploreWorkflow, type ExploreDeps } from "./explore/workflow.js";

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
export { profileInputSchema, profileWorkflow } from "./profile/workflow.js";
export type { ProfileDeps, ProfileInputs } from "./profile/workflow.js";
export { exploreInputSchema, exploreWorkflow, MAX_EXPLORE_CASES, progressOf } from "./explore/workflow.js";
export type { ExploreDeps, ExploreInputs } from "./explore/workflow.js";
export { EXPLORATION_ARTIFACT, EXPLORATION_TEMPLATE_VERSION, explorationSchema, exploreActionSchema } from "./explore/artifact.js";
export type { Exploration, ExploreAction } from "./explore/artifact.js";

/** Every built-in workflow, registered by the front doors. The data workflows need the run store and data access. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function builtinWorkflows(deps: TestCasesDeps & ProfileDeps & ExploreDeps): ReadonlyArray<WorkflowDefinition<any>> {
  // The Copilot spike's toy workflow is kept for tests only: users get the real ones.
  return [requirementsWorkflow(deps), testCasesWorkflow(deps), profileWorkflow(deps), exploreWorkflow(deps)];
}
export { helperPlan, helpersPath, LIGHTNING_HELPERS, LIGHTNING_LOCATOR_ORDER, LIGHTNING_RULES, lightningHelpersSource, renderPack, SALESFORCE_PACK_VERSION } from "./packs/salesforce.js";
export type { HelperChoice, PackHelper, PackRule } from "./packs/salesforce.js";
export { FILE_ROLES, SCRIPTS_DRAFT_ARTIFACT, SCRIPTS_TEMPLATE_VERSION, scriptsDraftArtifactSchema, scriptsDraftSchema } from "./scripts/artifact.js";
export type { FileRole, GeneratedFile, ScriptsDraft, ScriptsDraftArtifact } from "./scripts/artifact.js";
export { checkDraft, cucumberRegExp, TOKEN } from "./scripts/checks.js";
export type { CheckContext } from "./scripts/checks.js";
