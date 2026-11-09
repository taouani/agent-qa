/** `harness` module. See eslint.config.js for what it may import. */
export const MODULE = "harness";
export {
  DEFAULT_BROWSER_CASES,
  DEFAULT_CASES,
  DEFAULT_SEEDS,
  harnessCaseSchema,
  HarnessCaseError,
  loadCases,
  loadSeeds,
  SEED_KINDS,
  seedSchema,
  seedsFileSchema,
  syntheticTicketSchema,
  ticketTexts,
  validateCases,
} from "./cases.js";
export type { HarnessCase, HarnessCaseInput, Seed, SeedKind, SyntheticTicket } from "./cases.js";
export { emptyPipeline, RecordingDriver, runHarness, SeededLeakError, SeedScanner } from "./runner.js";
export type { CaseReport, HarnessReport, Pipeline, PipelineContext, RunHarnessOptions, SeededLeak, SeedHit } from "./runner.js";
export { harnessSources } from "./sources.js";
export type { HarnessSources } from "./sources.js";
export { FixtureDriver } from "./fixture-driver.js";
export { keptRate } from "./kept-rate.js";
export type { KeptRate } from "./kept-rate.js";
export { BROWSER_WORKFLOWS, maskedPipeline } from "./pipeline.js";
export type { MaskedPipelineOptions } from "./pipeline.js";
export { caseOutcomes, runnableRate } from "./runnable-rate.js";
export { STAND_IN_START, standInRecords, startStandInApp } from "./stand-in-app.js";
export type { StandInApp, StandInRecord } from "./stand-in-app.js";
export type { RunnableRate } from "./runnable-rate.js";
export { isoWeek, weeklyRates } from "./weekly.js";
export type { WeekRates } from "./weekly.js";
export { DASHBOARD_GENERATOR, dashboardData, HARNESS_LAST_REPORT, lastHarnessReport, renderDashboard } from "./dashboard.js";
export type { DashboardData } from "./dashboard.js";
