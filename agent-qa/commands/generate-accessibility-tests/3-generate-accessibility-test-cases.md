# PHASE 3: Generate Accessibility Test Cases

Generate accessibility test cases for each applicable WCAG 2.1 AA criterion per page, covering keyboard navigation, screen reader compatibility, color and contrast, forms, images, dynamic content, and responsive design.

## Core Responsibilities

1. **Generate Keyboard Navigation Tests**: Tab order, focus visibility, keyboard traps, skip links
2. **Generate Screen Reader Tests**: ARIA labels, roles, live regions, heading hierarchy
3. **Generate Color and Contrast Tests**: Contrast ratios, color-only information
4. **Generate Form Accessibility Tests**: Labels, error identification, error suggestions, input purpose
5. **Generate Image Accessibility Tests**: Alt text, decorative images, complex images
6. **Generate Dynamic Content Tests**: Status messages, loading states, alerts
7. **Generate Responsive Design Tests**: Reflow, text resize, orientation
8. **Assign Priority and Test Method**: Map Level A to P1, Level AA to P2, mark manual vs automated
9. **Language Detection**: Match language of source requirements

## Workflow

### Step 1: Detect Language (Automatic Language Matching)

For each source requirement:
1. Retrieve the `language` field from the source test case YAML front matter
2. If not available, detect language from test case content using heuristic analysis
3. Set the working language for accessibility test cases derived from that requirement
4. Apply 70% confidence threshold; if below, default to English

**Important**: All generated accessibility test cases MUST be written in the same language as the original requirement content. Do NOT translate unless explicitly instructed.

### Step 2: Generate the Accessibility Test Cases

Apply `@agent-qa/roles/accessibility-test-design.md` — its per-category sections and
`## Classification and Validation` — to the element catalogue and criterion mapping from Phase 2,
in the language detected in Step 1.

## Important Constraints

- Generate test cases for all applicable WCAG 2.1 AA criteria identified in Phase 2
- Do not generate test cases for criteria that are not applicable to the page
- Include both Level A and Level AA criteria (A is prerequisite for AA conformance)
- Use specific, measurable pass/fail criteria in expected results
- Mark each test as manual, automated, or semi-automated
- Include tool recommendations for automated and semi-automated tests
- Match language of original requirements
- Maintain traceability to source test cases and requirement keys
