/** `connectors` module. See eslint.config.js for what it may import. */
export const MODULE = "connectors";
export { ConnectorError, HttpClient, nodeHandlesProxy, noProxyMatches, parseRetryAfter, selectFetch } from "./http.js";
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
} from "./jira.js";
