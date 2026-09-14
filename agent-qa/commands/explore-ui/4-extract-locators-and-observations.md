# Phase 4: Extract Locators and Observations

## Core Responsibilities

Turn raw snapshots into ranked, reusable locators and explicit wait conditions.

## Workflow Steps

### Step 1: Load the Priority Ladder

Read `## Locator Priority` from `@agent-qa/rules/automation-conventions.md`, then the profile's
`## Locator Priority`. The profile wins where they differ.

### Step 2: Derive a Locator Per Element

For every element acted on or asserted during the walk, read its snapshot entry and build the
highest-ranked locator that uniquely identifies it. Verify uniqueness against the same snapshot:
if two entries share the role and name, the locator is not unique — move down a rank or add a
scoping parent, and record why.

Record for each: the test case, the step number, the element description from the test case, the
locator expression, its rank, and the snapshot file it came from. Provenance matters — a locator
with no snapshot behind it is a guess and must not be emitted.

### Step 3: Derive Wait Conditions

From the snapshot sequence, identify where a state took more than one snapshot to settle — a
spinner, an overlay, a late-rendered section. Express each as an observable condition, for example
"wait for the busy indicator with role `progressbar` to detach", never as a duration.

### Step 4: Record Exact Strings

Capture confirmation and validation messages verbatim from the snapshots, with the state they
appeared in. Generated assertions must use the real string, not the test case's paraphrase.

### Step 5: Group by Page

Group elements by the page or view they belong to, so Phase 5 can emit one page-object group per
page. Use the naming convention recorded in the profile's `page_object_naming`.

## Data Storage

- `locators`: list of {test_case, step, element, locator, rank, snapshot}
- `waits`: list of {page, condition, observed_on}
- `messages`: list of {text, state, snapshot}
- `pages`: grouping of elements by page

## Constraints

- Every locator must cite the snapshot it came from
- Never emit a duration-based wait
- Never paraphrase an observed message
- Do NOT write files in this phase
