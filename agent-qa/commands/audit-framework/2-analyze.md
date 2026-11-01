# Phase 2: Analyze

## Core Responsibilities

Assess the sampled framework across eight axes and record evidence-backed observations.

## Workflow Steps

Read `@agent-qa/rules/automation-conventions.md` first. For each axis, record observations with
file and line evidence. An observation without evidence is not recorded.

### Step 1: Architecture and Layering

Do specs depend only on page objects, fixtures, and services? Record every place a spec reaches
past those layers — raw selectors, direct HTTP calls, filesystem access.

### Step 2: Design Patterns

Which patterns are in use (page object, component object, fixture composition, builder for test
data)? Record where a pattern is applied inconsistently — that costs more than not using it.

### Step 3: Duplication and Reuse

Identify repeated locator definitions, repeated login or setup sequences, and near-identical
helpers. Quantify: how many occurrences, in how many files.

### Step 4: Locator Strategy

Compare observed locators against the profile's `## Locator Priority`. Report the distribution by
rank and list the lowest-rank locators with no justifying comment.

### Step 5: Synchronization

Find every fixed sleep, every bare `waitForSelector` where a web-first assertion would serve, and
every retry loop. These are the flake sources.

### Step 6: Test Data

Is data generated, fixtured, or hard-coded? Find tests sharing a mutable record, and data that
must exist in the environment beforehand without a documented setup.

### Step 7: Naming

Are spec titles behaviour statements? Do file, class, and method names follow one convention?
Report deviations only where the repository is otherwise consistent.

### Step 8: Scalability

Can the suite run in parallel? Look for worker-shared state, fixed ports, shared accounts, and
order dependencies. Estimate what breaks first as the suite grows.

## Data Storage

- `observations`: list of {axis, evidence, files, occurrences}

## Constraints

- Do NOT modify any file
- Do NOT record an observation without file and line evidence
- Do NOT propose fixes here — Phase 3 prioritises, Task 11 plans
