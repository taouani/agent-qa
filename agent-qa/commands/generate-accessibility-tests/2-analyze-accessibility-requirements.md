# PHASE 2: Analyze Accessibility Requirements

Analyze each UI-facing test case to identify pages, UI elements, interaction patterns, and map them to applicable WCAG 2.1 AA success criteria.

## Core Responsibilities

1. **Identify Pages and Views**: Extract pages/views referenced in each test case
2. **Catalog UI Elements**: Identify all UI element types per page
3. **Identify Interaction Patterns**: Determine how users interact with each element
4. **Identify Content Types**: Classify content types present on each page
5. **Map to WCAG 2.1 AA Criteria**: Determine applicable success criteria per page
6. **Load WCAG Mapping Template**: Load format template for accessibility test structure

## Workflow

### Step 1: Extract Pages and Views

For each UI test case, identify the pages or views referenced:
- Parse navigation steps (e.g., "Navigate to the login page" -> `login`)
- Parse URL references or route patterns
- Parse page object references if present
- Group test cases by page/view

Build a page inventory:
- Page name (normalized, lowercase, hyphenated)
- Source test cases referencing this page
- Requirement keys associated with the page

### Step 2: Catalogue Elements and Map to WCAG

Apply `@agent-qa/roles/accessibility-mapping.md`, sections `## Cataloguing UI Elements` and
`## WCAG Success Criterion Mapping`, to the pages extracted in Step 1.

### Step 3: Load WCAG Mapping Template

Load the format template for accessibility test case structure:
1. Check for custom template first: `agent-qa/custom-templates/accessibility/wcag-mapping-template.md`
2. If not found, use default: `agent-qa/formats/accessibility/wcag-mapping-template.md`

Read and store the template for use in Phase 3.

### Step 4: Store Results

Store in memory:
- Page inventory with associated requirement keys and test cases
- UI elements catalog per page
- Interaction patterns per page
- Content types per page
- WCAG 2.1 AA criteria applicability matrix (criteria x pages)
- Loaded format template

## Important Constraints

- Only map criteria that are genuinely applicable based on the UI elements and content found
- Do not force-apply all criteria to every page
- Criteria at Level A are included because they are prerequisites for AA conformance
- When in doubt about applicability, include the criterion (it is better to test and confirm than to miss)
- Maintain traceability from pages back to source test cases and requirement keys
