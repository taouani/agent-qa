/** `data` module. See eslint.config.js for what it may import. */
export const MODULE = "data";
export { DataAccess, salesforceKey, salesforceKeyPath, secretSources } from "./access.js";
export type { DataAccessOptions, ExplorerData, HostData, MaskedTestResult, ProfileData, RequirementsData, SalesforceData, ScriptsData, TestRunOutcome, TypeCheckOutcome, WriteFilesOutcome, PullRequestOutcome, XrayData } from "./access.js";
export { mdSafe, prBase } from "./access.js";
export { parsePlaywrightReport, type ParsedReport, type ReportedTest, type TestOutcome } from "./test-report.js";
export { isPlainRelativePath, isProtectedPath } from "./generated-files.js";
export { isSalesforceSandbox } from "./explorer.js";
export type { BrowserLike, ExplorerTarget, ExploreSetup, MaskedAction, MaskedPage, MaskedResult, OpenBrowser } from "./explorer.js";
export { MAX_SNAPSHOT_CHARS, maskAriaSnapshot, maskTitle } from "./snapshot.js";
export type { BrowserAction, BrowserTarget } from "../connectors/index.js";
/** Key names the explorer presses: never free text. */
export { KEY as PRESS_KEY } from "../connectors/index.js";
export type { SalesforceSession, TypeDiagnostic } from "../connectors/index.js";
export {
  commandList,
  describeProfile,
  findProjectFolder,
  FRAMEWORK_KINDS,
  FRAMEWORK_PROFILE_ARTIFACT,
  FRAMEWORK_PROFILE_SPEC,
  KNOWN_COMMANDS,
  reviewedPart,
  FRAMEWORK_PROFILE_TEMPLATE_VERSION,
  frameworkProfileSchema,
  PROFILE_FILE,
  profileCommandsSchema,
  ProfileError,
  readPlaywrightConfig,
  readSavedProfile,
  savedProfileSchema,
  scanFramework,
} from "./profile.js";
export type { FrameworkProfile, ProfileCommands, SavedProfile } from "./profile.js";
export { AUTH_PATH, listFolderFiles, LOCATOR_FORMS, MAX_LISTED_FILES, scanFeature, scanRepo, scanSource } from "./profile-scan.js";
export { fixSkeleton, onlyWaitsAdded, scanGeneratedCode, type FixSkeleton } from "./code-scan.js";
export type { CodeFinding, CodeScan } from "./code-scan.js";
export type { FolderListing, LocatorForm, RepoScan, ScannedFeature, ScannedPage, ScannedStep } from "./profile-scan.js";
export { ALLOWED_FLAGS, BUILTIN_REPORTERS, checkHostCommand, HostCommandRefused, hostCwd, hostEnv } from "./host.js";
export type { HostCommandOutcome, HostCommandRequest } from "./host.js";
export { caseLabel, toXrayTest } from "./xray.js";
export type { ExistingTest, PushCase, XrayPlan, XrayPushResult } from "./xray.js";
export { formatDoctor, runDoctor } from "./doctor.js";
export { isIgnored, loadIgnoreRules } from "./gitignore.js";
export type { CheckResult, CheckStatus, DoctorOptions } from "./doctor.js";
export {
  acceptanceCriterionSchema,
  criteriaFromDescription,
  linkedPageSchema,
  MASKING_REPORT_ARTIFACT,
  MaskedDataService,
  maskingReportSchema,
  maskJql,
  requirementSchema,
  SOURCES_ARTIFACT,
  SOURCES_VERSION,
  withoutTests,
  splitCriteria,
} from "./requirements.js";
export type { LoadedSources, LoadOptions, MaskedDataOptions, MaskedSources, MaskingReport, Requirement } from "./requirements.js";
export type { JiraCollection, JiraInput, JiraIssue } from "../connectors/index.js";
