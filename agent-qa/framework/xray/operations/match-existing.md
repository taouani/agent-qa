# Match Existing Xray Tests

The semantics behind "does this test already exist in Jira" — a Jira label lookup, not a title
or content comparison. `scripts/xray/upload.py` performs this lookup itself
(`XrayClient.find_tests_by_label`); this file explains what it means and why it must not be
worked around.

## Purpose

Every re-run of Xray upload must update tests that already exist rather than create duplicates.
The only mechanism that makes that possible is a Jira label carrying the test case's TC-ID. This
instruction file is the semantics behind that mechanism — read it before assuming any other way
of identifying "the same test" (summary text, folder path, Gherkin scenario name) is safe to add.

## Core Semantics

1. **The match key is a Jira label equal to the TC-ID.** A test case generated as
   `TC-PROJ-123-001` (see `agent-qa/rules/qa-conventions.md`, "Test Case ID Format") is matched
   against Jira issues in the target project carrying the label `TC-PROJ-123-001`, exactly —
   case-sensitive, no prefix or suffix added.

2. **Found means update, absent means create.** A test case whose TC-ID label already exists on
   some issue in the project is treated as already present: the run updates that issue rather
   than creating a new one. A TC-ID with no matching label is new: the run creates an issue and
   applies the label at creation, so the *next* run finds it.

3. **The label must be applied at creation and must never be omitted.** This is the entire
   mechanism — there is no other identifier tying a Jira issue back to a TC-ID. A test created
   without its label is invisible to every future lookup: the next run cannot find it, treats the
   TC-ID as new, and creates a second issue for it. The label is not cosmetic metadata; it is the
   only thing preventing every re-run from duplicating every test.

4. **Matching is per test case, not per file or per folder.** Each TC-ID is looked up
   independently. A folder with 40 test cases where 12 already exist in Jira updates those 12 and
   creates the other 28 in the same run — partial overlap is the normal case, not a special one.

## Why This Matters for Resumability

Because matching is label-based and independent per TC-ID, a run that fails partway through is
safe to simply re-run:

- Tests already created or updated before the failure now carry (or already carried) their
  label, so the next run's lookup finds them and updates them — it does not recreate them.
- Tests not yet reached by the failed run are still absent from the label lookup, so the next run
  creates them normally.

No manual cleanup or bookkeeping is required between attempts. This is the property that lets
`agent-qa/framework/xray/operations/upload-tests.md` describe a partial failure as resumable
rather than as a state that needs to be untangled by hand.

## Constraints

- Do not propose matching by summary text, Gherkin scenario name, or file path — none of these
  survive a renamed requirement or a re-worded summary, and the label is already sufficient.
- Do not omit the label on a created test to "simplify" the payload. There is no fallback
  identifier; omitting it breaks resumability silently, and the first sign of the problem is
  duplicated tests in Jira, discovered long after the run that caused them.
- Gherkin (Cucumber) tests are the one case this file's mechanism does not fully cover: Xray's
  feature import matches scenarios by its own undocumented rule, not by this label (see
  `agent-qa/framework/xray/api-contract.md`, `## Unverified` item 7, and
  `agent-qa/framework/xray/operations/upload-tests.md`).

## Usage Example

```markdown
## Step 2: Explain Resumability

Follow the semantics in: `agent-qa/framework/xray/operations/match-existing.md`

If a previous run reported failures, tell the user it is safe to re-run unmodified: matching is
label-based, so tests already created or updated will be found and updated, not duplicated.
```

## Important Notes

- The lookup itself is a Jira JQL search (`agent-qa/framework/xray/api-contract.md`, "2. JQL
  search" under each flavour) scoped to `project = {key} AND labels in (...)`; this file
  describes its meaning, not its transport.
- This mechanism is implemented once, in `scripts/xray/xray_client.py`'s
  `find_tests_by_label`, and consumed identically on both flavours. Commands never re-implement
  matching themselves.
