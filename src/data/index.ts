/** `data` module. See eslint.config.js for what it may import. */
export const MODULE = "data";
export { DataAccess, secretSources } from "./access.js";
export type { DataAccessOptions, HostData, RequirementsData, XrayData } from "./access.js";
export { ALLOWED_FLAGS, checkHostCommand, HostCommandRefused, hostCwd, hostEnv } from "./host.js";
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
