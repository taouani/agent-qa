/** `connectors` module. See eslint.config.js for what it may import. */
export const MODULE = "connectors";
export { ConnectorError, HttpClient, networkCause, nodeHandlesProxy, noProxyMatches, parseRetryAfter, selectFetch } from "./http.js";
export type { ConnectorErrorCode, FetchLike, HttpClientOptions, Method, ReadOnlyPost, RequestOptions } from "./http.js";
export { adfToText } from "./adf.js";
export type { AdfNode, AdfText } from "./adf.js";
export { ISSUE_KEY, JiraClient } from "./jira.js";
export type {
  CollectOptions,
  JiraClientOptions,
  JiraCollection,
  JiraField,
  JiraInput,
  JiraIssue,
  JiraLink,
  JiraPerson,
  JiraRemoteLink,
  AgentTest,
} from "./jira.js";
export { ConfluenceClient, pageIdFromUrl, pageIdToTiny, tinyToPageId } from "./confluence.js";
export type { ConfluenceClientOptions, ConfluencePage, PageRef, SkippedPage } from "./confluence.js";
export { inline as storageInline, markdownToStorage } from "./markdown-storage.js";
export { decodeEntities, parseStorage, storageToText } from "./storage.js";
export type { StorageText } from "./storage.js";
export { XRAY_BULK_LIMIT, XRAY_CLOUD_URL, XrayClient, jiraDate } from "./xray.js";
export type { XrayClientOptions, XrayEvidence, XrayExecutionInput, XrayExecutionResult, XrayJobIssue, XrayJobResult, XrayRunStatus, XrayStep, XrayTest } from "./xray.js";
export { BRANCH, GITHUB_API, GitHubClient } from "./github.js";
export { AZURE_DEVOPS_API, AzureDevOpsClient } from "./azure-devops.js";
export { GITLAB_API, GitLabClient } from "./gitlab.js";
export type { AzureDevOpsClientOptions } from "./azure-devops.js";
export { unifiedDiff } from "./unified-diff.js";
export { createGitHost } from "./create-git-host.js";
export type { GitHostConfig } from "./create-git-host.js";
export { capPatches, checkIssueKey, DEFAULT_DIFF_BYTES, DEFAULT_PULL_REQUESTS, namesKey } from "./git-host.js";
export type { DiffOptions, FindPullRequestsOptions, GitHost, GitPlatform, PullRequestDiff, PullRequestFileChange, PullRequestRef } from "./git-host.js";
export type { GitHubClientOptions, OpenedPullRequest, PullRequestFiles } from "./github.js";
export { runHostCommand } from "./host.js";
export type { HostCommandOptions, HostCommandResult } from "./host.js";
export { createRepoFile, removeCreatedRepoFile, readPlainFile, replaceCreatedRepoFile, removeRepoFile, replaceRepoFile, withScratchFile, withScratchFolder, writeRepoFile, type CreatedRepoFile } from "./repo-files.js";
export { defaultAudience, normalizePem, OAUTH_HINTS, SalesforceAuth, SalesforceAuthError, SalesforceSession, signAssertion } from "./salesforce.js";
export type { SalesforceAuthOptions } from "./salesforce.js";
export { BrowserError, ExplorerBrowser, KEY, loadPlaywright, MIN_PLAYWRIGHT } from "./browser.js";
export type { ActionOutcome, ActionResult, BrowserAction, BrowserTarget, LoadedPlaywright, OpenBrowserOptions, PageSnapshot } from "./browser.js";
export { findTypeScript, loadTypeScript, local, MAX_DIAGNOSTICS, TypeCheckError, typeCheckFiles } from "./typecheck.js";
export type { TypeCheckOptions, TypeDiagnostic, TypeScriptModule } from "./typecheck.js";
