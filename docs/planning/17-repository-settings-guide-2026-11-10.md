# Repository settings guide: DCO and release PRs

10 Nov 2026 · @Tarek AOUANI

These are two settings jobs on GitHub for you (answers 5 and 6 of the 10 Nov alignment), about 20 minutes together. The repository side is already merged: `.github/CODEOWNERS` and the App token step in `release.yml`.

## 1. Stop a pull request from changing the check it is checked by (5 min)

**The gap:** the `dco` check runs the workflow file from the pull request's own branch. A pull request can edit `.github/workflows/dco.yml` so that it always passes.

**Assumption:** GitHub's "Require workflows to pass before merging" rule, which runs a workflow from a fixed ref, isn't offered to repositories under a personal account. I couldn't confirm this from GitHub's docs. If you see it in step 3, use it for `.github/workflows/dco.yml` on `master`, and you can skip steps 1 and 2.

What works on a personal repository instead is code owners:

1. `.github/CODEOWNERS` (merged) names you as the owner of `.github/workflows/`, `scripts/dco.mjs`, `scripts/check-dco.mjs` and the CODEOWNERS file itself.
2. Go to Settings, Rules, Rulesets, and open the ruleset on `master`. Under "Require a pull request before merging", check that **"Require review from Code Owners"** is ticked. It was on when I last read the ruleset.
3. On the same page, under **Bypass list**, add **Repository admin** and set it to "For pull requests only". Then save.

**The effect:**
- Someone else's pull request that touches a workflow or the DCO scripts can't merge until you approve it.
- GitHub doesn't let you approve your own pull request, and the ones I open are yours. So when one of mine changes a workflow, you merge it with "Merge without waiting for requirements" (the bypass).
- Pull requests that don't touch those files don't change at all.

## 2. Release PRs that run their checks without asking (15 min)

**The gap:** the release workflow opens "Version packages" with its own token. GitHub then holds that pull request's checks until you click "Approve and run workflows". With a GitHub App's token, GitHub runs them straight away, as it does for a person's pull request.

1. **Create the App.**
   1. Go to your profile picture, Settings, Developer settings, GitHub Apps, and click **New GitHub App**.
   2. Fill in these fields:
      - Name: `agent-qa-release`, or any free name up to 34 characters.
      - Homepage URL: `https://github.com/taouani/agent-qa`.
      - Callback URL and Setup URL: leave them empty.
      - Webhook: untick **Active**.
   3. Under Permissions, Repository permissions, set **Contents** to "Read and write" and **Pull requests** to "Read and write". Leave everything else at "No access".
   4. Under "Where can this GitHub App be installed?", choose **Only on this account**, then click **Create GitHub App**.
2. **Make a key.**
   1. On the App's page, note the **App ID** shown near the top.
   2. Under Private keys, click **Generate a private key**. A `.pem` file downloads, and it's the only copy.
3. **Install it.** On the App's page, click Install App, then Install next to your account. Choose **Only select repositories**, select `agent-qa`, and click Install.
4. **Add two repository secrets.** Go to `agent-qa`, Settings, Secrets and variables, Actions, and click New repository secret:
   - `RELEASE_APP_ID`: the App ID.
   - `RELEASE_APP_PRIVATE_KEY`: the whole content of the `.pem` file, including the BEGIN and END lines.

   Then delete the downloaded `.pem` file.
5. **Tell me when it's done.** The next push to `master` updates "Version packages" with the App's token. I'll check that CI, Audit and DCO start by themselves.

**Checks on release PRs:**
- With the App, DCO is skipped on them, because the App is a bot. GitHub counts a skipped check as passed.
- CI still runs on them.
- Running checks by hand (docs/releasing.md) is then only needed if the App's secrets are missing. Without the secrets, the workflow falls back to its own token, as it does today.
