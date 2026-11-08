/** `workflows` module. See eslint.config.js for what it may import. */
import type { WorkflowDefinition } from "../core/index.js";
import { requirementsWorkflow } from "./requirements/workflow.js";
import { testCasesWorkflow, type TestCasesDeps } from "./test-cases/workflow.js";
import { profileWorkflow, type ProfileDeps } from "./profile/workflow.js";
import { exploreWorkflow, type ExploreDeps } from "./explore/workflow.js";
import { scriptsWorkflow, type ScriptsDeps } from "./scripts/workflow.js";
import { runTestsWorkflow, type RunTestsDeps } from "./run-tests/workflow.js";
import { debugWorkflow, type DebugDeps } from "./debug/workflow.js";
import { reviewWorkflow, type ReviewDeps } from "./review/workflow.js";
import { auditWorkflow, type AuditDeps } from "./audit/workflow.js";
import { refactorWorkflow, type RefactorDeps } from "./refactor/workflow.js";
import { documentWorkflow } from "./document/workflow.js";

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
export { packageName, SCAFFOLD_STYLES, scaffoldFiles } from "./scaffold/templates.js";
export type { ScaffoldFile, ScaffoldStyle } from "./scaffold/templates.js";
export { exploreInputSchema, exploreWorkflow, MAX_EXPLORE_CASES, progressOf } from "./explore/workflow.js";
export type { ExploreDeps, ExploreInputs } from "./explore/workflow.js";
export { EXPLORATION_ARTIFACT, EXPLORATION_TEMPLATE_VERSION, explorationSchema, exploreActionSchema } from "./explore/artifact.js";
export type { Exploration, ExploreAction } from "./explore/artifact.js";

/** Every built-in workflow, registered by the front doors. The data workflows need the run store and data access. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function builtinWorkflows(deps: TestCasesDeps & ProfileDeps & ExploreDeps & ScriptsDeps & RunTestsDeps & DebugDeps & ReviewDeps & AuditDeps & RefactorDeps): ReadonlyArray<WorkflowDefinition<any>> {
  // The Copilot spike's toy workflow is kept for tests only: users get the real ones.
  return [requirementsWorkflow(deps), testCasesWorkflow(deps), profileWorkflow(deps), exploreWorkflow(deps), scriptsWorkflow(deps), runTestsWorkflow(deps), debugWorkflow(deps), reviewWorkflow(deps), auditWorkflow(deps), refactorWorkflow(deps), documentWorkflow(deps)];
}
export { helperPlan, helpersPath, LIGHTNING_HELPERS, LIGHTNING_LOCATOR_ORDER, LIGHTNING_RULES, lightningHelpersSource, renderPack, SALESFORCE_PACK_VERSION } from "./packs/salesforce.js";
export type { HelperChoice, PackHelper, PackRule } from "./packs/salesforce.js";
export { checkFix, DEFAULT_FIX_ROUNDS, DEFAULT_STABILITY_RUNS, FAILURE_KINDS, fixSchema, MAX_FIX_ROUNDS, SCRIPTS_RUN_ARTIFACT, scriptsRunSchema, type FailureKind, type FixOutput, type RunAttempt, type ScriptsRun } from "./scripts/run.js";
export { prBody, SCRIPTS_PR_ARTIFACT, scriptsPrSchema, type ScriptsPr } from "./scripts/pull-request.js";
export { FILE_ROLES, SCRIPTS_DRAFT_ARTIFACT, SCRIPTS_TEMPLATE_VERSION, SCRIPTS_WRITTEN_ARTIFACT, scriptsDraftArtifactSchema, scriptsDraftSchema, scriptsWrittenSchema } from "./scripts/artifact.js";
export type { FileRole, GeneratedFile, ScriptsDraft, ScriptsDraftArtifact, ScriptsWritten } from "./scripts/artifact.js";
export { checkDraft, pathKey, TOKEN } from "./scripts/checks.js";
export type { CheckContext } from "./scripts/checks.js";
export { MAX_SCRIPT_CASES, scriptsInputSchema, scriptsWorkflow, withHelper } from "./scripts/workflow.js";
export type { ScriptsDeps, ScriptsInputs } from "./scripts/workflow.js";
export { changeLines, runTestsInputSchema, runTestsWorkflow, statusOf, TEST_RUN_ARTIFACT, testRunSchema, XRAY_EXECUTION_ARTIFACT, xrayExecutionSchema } from "./run-tests/workflow.js";
export type { RunTestsDeps, RunTestsInputs, TestRun, XrayExecution } from "./run-tests/workflow.js";
export { checkDebugFix, DEBUG_REPORT_ARTIFACT, debugFixSchema, debugPrBody, debugInputSchema, debugReportSchema, debugWorkflow, roleOf } from "./debug/workflow.js";
export type { DebugDeps, DebugFix, DebugInputs, DebugReport } from "./debug/workflow.js";
export { checkReview, FINDING_KINDS, FINDINGS_ARTIFACT, findingsSchema, globRegExp, MAX_REVIEW_FILES, reviewInputSchema, reviewOutputSchema, reviewPrBody, reviewWorkflow, SEVERITIES } from "./review/workflow.js";
export type { Finding, Findings, ReviewDeps, ReviewInputs, ReviewOutput, Severity } from "./review/workflow.js";
export { leaving, testFilesPrStep, type TestFilesPrRecord } from "./shared/test-files-pr.js";
export { AUDIT_AREAS, AUDIT_ARTIFACT, AUDIT_ROLES, auditInputSchema, auditOutputSchema, auditRoleOf, auditSchema, auditWorkflow, checkAudit, MAX_AUDIT_READ, rankFindings, scoreAreas } from "./audit/workflow.js";
export type { Audit, AuditArea, AuditDeps, AuditFinding, AuditInputs, AuditOutput, AuditRole } from "./audit/workflow.js";
export { checkRefactored, MAX_REFACTOR_READ, REFACTOR_REPORT_ARTIFACT, refactorInputSchema, refactorPlanSchema, refactorPrBody, refactorReportSchema, refactorWorkflow, simulatePlan } from "./refactor/workflow.js";
export type { RefactorDeps, RefactorInputs, RefactorPlan, RefactorReport, RefactorTask } from "./refactor/workflow.js";
export { DOCUMENT_TYPES, documentInputSchema, documentWorkflow } from "./document/workflow.js";
export type { DocumentInputs } from "./document/workflow.js";
export { DOCUMENT_ARTIFACT, DOCUMENT_DRAFT_ARTIFACT, DOCUMENT_ENGINE_VERSION, documentDraftSchema, documentSchema } from "./document/artifact.js";
export type { DocumentArtifact, DocumentDraft } from "./document/artifact.js";
export { TEST_PLAN, testPlanSchema } from "./document/test-plan.js";
export type { TestPlan } from "./document/test-plan.js";
export { TEST_LEVELS, TEST_STRATEGY, TEST_TYPES, testStrategySchema } from "./document/test-strategy.js";
export type { TestStrategy } from "./document/test-strategy.js";
export { AREA_KINDS, TEST_CHARTER, testCharterSchema } from "./document/test-charter.js";
export type { TestCharter } from "./document/test-charter.js";
export { levelOf, RISK_CATEGORIES, RISK_REGISTER, riskRegisterSchema, scoreOf, WEAK_QUALITY } from "./document/risk-register.js";
export type { RiskRegister } from "./document/risk-register.js";
export { DATA_KINDS, TEST_DATA, testDataSchema } from "./document/test-data.js";
export type { TestData } from "./document/test-data.js";
export { matrixOf, TRACEABILITY, traceabilitySchema } from "./document/traceability.js";
export type { Traceability } from "./document/traceability.js";
export { RELEASE_CATEGORIES, RELEASE_NOTES, releaseNotesSchema, versionsOf } from "./document/release-notes.js";
export type { ReleaseNotes } from "./document/release-notes.js";
export type { DocumentMeta, DocumentSources, DocumentType, SourceNeed } from "./document/types.js";
