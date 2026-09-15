# Xray upload — known limitations and what to verify

Written when the feature was built. Items in the first table need one run against a
throwaway Jira project to settle; the rest are stated limitations or small known gaps.

Everything here is a deliberate, recorded gap. None is a defect found and ignored; each is
something that **cannot be settled without a live environment**, or a limitation stated honestly in
the tool's own output. Grouped by what it takes to close.

## Needs a throwaway Jira project (the one real-environment run)

Run the sequence once against a disposable project, on each flavour: dry-run, then `--execute`,
then **re-run the identical folder**. The re-run is the test — it must report UPDATE, not CREATE.

| # | Item | How it shows up if wrong |
|---|---|---|
| 1 | Cloud bulk import honours a top-level `key` as "update this issue" (contract Unverified 8) | Re-run reports `created` where `updated` was expected — visible in the report, not silent |
| 2 | Gherkin re-import dedup depends on Xray's own matching (contract Unverified 7) | A second run creates a second Cucumber test; the run report warns about this in advance |
| 3 | Cloud `nextPageToken` response field name | Pagination stops after page one, so matching misses existing tests and creates duplicates |
| 4 | `testtype` vs `xray_testtype` field naming | First contact rejects every test — loud, immediate |
| 5 | Server `issuetype: {"name": "Test"}` on an instance that renamed the type | 400 on bulk create — loud. Config key `xray_test_issue_type` exists to fix it without a code change |
| 6 | `precondInfo` / `preCondInfo` casing (contract Unverified 1) | Silently ignored — the part is optional, so nothing errors. Mitigated by not sending it |
| 7 | Server v2.0 step field display-name casing (contract Unverified 3) | Immaterial while v1.0 stays pinned |

## Stated limitations, working as designed

| # | Item | Why it is not a bug |
|---|---|---|
| 8 | **Server/DC: updating a test updates its fields but NOT its steps.** | v1.0 documents step creation only, so re-PUTing would append duplicate steps; a v2.0 delete-then-recreate could leave a customer's test with zero steps if it failed midway. The tool prints a NOTE saying steps were not modified whenever it updates something. Closing it needs contract Unverified 6 |
| 9 | No 429 / `Retry-After` back-off (Ruling 23) | No vendor page states a rate limit for either flavour (contract Unverified 5) |
| 10 | Field update is last-write-wins; only `summary` and `labels` are sent (Ruling 25) | Optimistic concurrency needs an issue version we do not fetch; the fields sent are the ones we generated |

## Small, known, low-risk

| # | Item |
|---|---|
| 11 | `TC_ID_PATTERN` has no word-boundary anchor — a TC-ID embedded in a longer token would match. Safety comes from set equality, not the pattern |
| 12 | `_read_config_value` is a narrow flat-key YAML reader — no nested keys, no multi-line values. Fine for the five keys it reads |
| 13 | `_require_known_platform()` is still lazy at first use rather than enforced at construction. It raises rather than failing silently, so not the silent-success class |
| 14 | 16 pre-existing installer functions report file counts of 0 (`count++` inside a piped `while read` runs in a subshell). Pre-existing, deliberately left out of scope; the two NEW functions were fixed |
| 15 | PowerShell installer path is written but **untested by execution** — no interpreter available in this environment |

## Also needs a real environment (carried from earlier sub-projects)

| # | Item |
|---|---|
| 16 | Windows run of sub-project 2's migration |
| 17 | A Copilot/Codex run confirming `@agent-qa/roles/...` path following |
