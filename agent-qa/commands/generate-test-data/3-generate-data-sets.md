# Phase 3: Generate Data Sets

## Core Responsibilities

Generate structured test data sets for each entity and field.

## Workflow

### Step 1: Generate the Data Sets

Apply `@agent-qa/roles/test-data-design.md` — sections `## Valid Data`, `## Invalid Data`,
`## Boundary Data`, `## Null and Empty Data` and, when `test_types` includes `security`,
`## Security Data` — to the entities identified in Phase 2.

### Step 2: Assign Data Set IDs

Use the format: `{CATEGORY}-{ENTITY}-{NNN}`
- `VD` = Valid Data
- `ID` = Invalid Data
- `BD` = Boundary Data
- `NE` = Null/Empty
- `SD` = Security Data

## Data Storage

Store all generated data sets organized by entity and category.

## Constraints

- Generate specific, realistic values — not placeholders
- Use the requirement's language for descriptions where applicable
- Flag assumptions about constraints that were not explicitly stated in requirements
- Keep data sets practical and maintainable (not exhaustive combinatorial)
