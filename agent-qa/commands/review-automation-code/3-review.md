# Phase 3: Review

## Core Responsibilities

- Apply the checklist for each file's type
- Produce severity-tagged findings with concrete fixes

## Workflow Steps

### Step 1: Apply the Universal Checklist

For every file:

1. No secret, token, password, or production credential appears in the source.
2. No `page.waitForTimeout()` or other fixed sleep.
3. No `test.skip()`, `test.fixme()`, or commented-out assertion without a linked ticket.
4. Locators follow the priority in `conventions`; any CSS or XPath carries a justifying comment.
5. No conditional branching on application state that makes the test assert different things
   on different runs.

### Step 2: Apply the Type Checklist

**Spec files**
- Each `test()` asserts one behaviour and its title states that behaviour.
- No locator is defined inline — locators belong in a page object.
- Assertions are web-first (`expect(locator).toBeVisible()`), not state reads.
- Test data is generated or fixtured, never a hard-coded record that another test also uses.
- No dependency on execution order between tests.

**Page objects**
- Locators are readonly properties assigned in the constructor.
- Methods express user intent (`submitOrder()`), not mechanics (`clickButton3()`).
- No assertions inside a page object — those belong in the spec.
- No `page.waitForTimeout()`.

**Fixtures**
- Teardown exists and runs even when the test fails.
- No shared mutable state between workers.
- Auth state is loaded from a path, never assembled from inline credentials.

**Services and utilities**
- No browser or `page` dependency in a service.
- Errors propagate; failures are not swallowed into a default return value.

### Step 3: Record Findings

For each finding record: file path and line, severity from `## Severity Levels`, what is wrong,
why it matters, and the concrete replacement code. A finding without a concrete fix is not ready
to report — either produce the fix or drop the finding.

### Step 4: Suppress Noise

Do not report formatting, import order, or naming preferences that the repository applies
consistently. Consistency with the host repository outranks personal preference.

## Data Storage

- `findings`: list of {path, line, severity, problem, why, fix}

## Constraints

- Do NOT apply any fix in this phase
- Do NOT report a finding you cannot fix concretely
- Severity must come from `automation-conventions.md`, not invented
