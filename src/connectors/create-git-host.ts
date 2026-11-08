import { AzureDevOpsClient } from "./azure-devops.js";
import type { GitHost, GitPlatform } from "./git-host.js";
import { GitHubClient } from "./github.js";
import type { FetchLike } from "./http.js";

export interface GitHostConfig {
  platform: GitPlatform;
  repo: string;
  baseUrl?: string | undefined;
}

/** The client for `git` in agent-qa.yaml, with its token resolved. */
export function createGitHost(git: GitHostConfig, token: string, options: { fetch?: FetchLike } = {}): GitHost {
  switch (git.platform) {
    case "github":
      return new GitHubClient({ repo: git.repo, token, ...(git.baseUrl ? { baseUrl: git.baseUrl } : {}), ...(options.fetch ? { fetch: options.fetch } : {}) });
    case "azure-devops":
      return new AzureDevOpsClient({ repo: git.repo, token, ...(git.baseUrl ? { baseUrl: git.baseUrl } : {}), ...(options.fetch ? { fetch: options.fetch } : {}) });
    default:
      throw new Error(`git.platform ${git.platform} isn't supported yet: GitHub and Azure DevOps only`);
  }
}
