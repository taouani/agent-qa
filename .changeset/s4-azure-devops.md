---
"sf-agent-qa": minor
---

Pull requests from CI on Azure DevOps Services: with `git.platform: azure-devops` and `repo: organization/project/repository`, `scripts --ci` (and the other workflows that open pull requests) opens its pull request through Azure DevOps' REST API, with a personal access token or `$(System.AccessToken)`. The base branch comes from Azure Pipelines' variables. See docs/scripts.md.
