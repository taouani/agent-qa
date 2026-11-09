# Contributing to Agent-QA

Thank you for helping. This page covers setting up a clone, the rules the code follows, and what a pull request needs. To report a vulnerability, don't open an issue: see [SECURITY.md](SECURITY.md).

v2 lives on `master`. v1, the markdown prompt pack, is frozen on the `v1` branch at `v1.0.0` and takes no changes.

## Set up a clone

You need Node.js 20.19 or later, or 22.12 or later. The test runner needs these, even though the package itself runs on any Node 20.

```bash
git clone https://github.com/taouani/agent-qa.git
cd agent-qa
npm ci
npm run check
```

`npm run check` runs the type check, lint, tests and build. Run it before every push: CI runs the same steps on Ubuntu and Windows, with Node 20, 22 and 24.

| Command | What it does |
|---|---|
| `npm test` | The tests (vitest). The browser suites run only when `AGENT_QA_PLAYWRIGHT_DIR` points at a folder with Playwright and Chromium installed, and are skipped otherwise. |
| `npm run lint` | ESLint, including the module boundary and file-write rules below |
| `npm run build` | The bundle in `dist/`. On a locked-down Windows machine where esbuild fails with `Access is denied`, use `npm run build:tsc`. |
| `npm run schema` | Regenerates `schema/agent-qa.schema.json` after a change to `src/core/config/schema.ts`. A test checks that they match. |
| `npm run pack:check` | Packs the package and checks its file list, size, and that it holds no keys or tokens |
| `node dist/cli/bin.js harness` | The quality harness, offline: fails if a planted personal value reaches a model ([docs/harness.md](docs/harness.md)) |

To try your build in a project, run `node /path/to/agent-qa/dist/cli/bin.js <command>` from that project.

## The rules the code follows

These are checked by lint and tests, and a pull request that relaxes them to make something work is not merged.

- **Module boundaries.** `src/` is split into modules, and each may import only the ones in this table. The key rule: only `data` calls `connectors`, so every read of Jira, Confluence, Xray, a git host or Salesforce goes through masking.

  | Module | May import |
  |---|---|
  | `core` | itself only |
  | `masking` | core |
  | `connectors` | core |
  | `data` | core, masking, connectors |
  | `llm` | core |
  | `workflows` | core, data |
  | `harness` | core, data, masking, llm, workflows |
  | `mcp` | core, data, workflows |
  | `cli` | core, data, llm, workflows, harness, mcp |
  | `src/index.ts` (the public API) | core, data, workflows |

  When an import is refused, route the call through `data` instead.
- **Writes go through the policy layer.** Only the files listed in `FS_WRITERS` in `eslint.config.js` may write to disk, and only `src/connectors/host.ts` may run commands (the browser connector starts Chromium through Playwright, with a policy grant). Every other write outside the run folder asks `Policy.guard`. Adding a file to those lists needs a reason in the pull request.
- **No secrets in files.** Config holds only `${env:NAME}` or `${keychain:NAME}` references. Tests use made-up values: never a real name, email, token or ticket.
- **Code style.** ESM, TypeScript strict, relative imports with the `.js` extension. Schemas are zod. Artifacts are typed JSON with a `sourceHash`.

[docs/security.md](docs/security.md) explains what these protect.

## A pull request

1. **Open an issue first** for anything bigger than a fix, so we agree on the approach before you write it.
2. **Add tests** for what you change. A fix comes with a test that fails without it.
3. **Add a changeset** when the package changes for users: run `npx changeset`, pick the bump, and write one or two sentences for the changelog, in words a user understands. Changes to tests, CI or docs alone need none. How releases go out: [docs/releasing.md](docs/releasing.md).
4. **Sign off each commit** (below).
5. Fill in the pull request template. CI must be green.

## Sign off your commits (DCO)

Agent-QA uses the [Developer Certificate of Origin](https://developercertificate.org/) instead of a contributor agreement. By signing off a commit, you certify that you wrote it, or otherwise have the right to submit it under the project's license (Apache-2.0).

Sign off with `-s`, which adds a line with your git name and email:

```bash
git commit -s -m "Fix the Xray retry"
# Signed-off-by: Your Name <you@example.com>
```

The `DCO` check in CI fails a pull request with a commit whose sign-off is missing, or doesn't match its author's email. To fix the last commit: `git commit --amend -s --no-edit`, then `git push --force-with-lease`. For several commits of your own: `git rebase --signoff origin/master`, then the same push. That signs as you, so it only fixes commits you authored.

The check skips pull requests opened by bots, such as "Version packages". It skips a merge commit when its content is exactly what git merges from its parents, as with "Update branch"; a merge that changes anything itself needs a sign-off. Commits made in GitHub's web editor need one too: once the repository requires sign-off on web commits, GitHub adds it for you.

**Code written with an AI assistant.** You can use one, and you are still the author who signs off. An AI agent can't certify the DCO. Commits that an agent authors itself, such as `Claude <noreply@anthropic.com>`, pass only on a pull request a maintainer opened from this repository: that maintainer reviews them and answers for them.

## Issues

Use the templates: a bug report asks for the version, the host (CLI, VS Code, Claude Code, Cursor), the command, and what `agent-qa doctor --json` says. Leave real personal data, ticket contents and credentials out: use made-up values.
