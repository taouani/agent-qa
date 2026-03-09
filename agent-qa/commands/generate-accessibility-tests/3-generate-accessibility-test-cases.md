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

### Step 2: Generate Keyboard Navigation Tests

For each page with interactive elements, generate tests for:

**Tab Order (2.4.3 Focus Order)**:
- Verify tab order follows logical reading order
- Verify all interactive elements are reachable via Tab key
- Verify Shift+Tab navigates in reverse order

**Focus Visibility (2.4.7 Focus Visible)**:
- Verify visible focus indicator on all focusable elements
- Verify focus indicator has sufficient contrast (3:1 minimum)
- Verify focus indicator is not obscured by other elements

**Keyboard Traps (2.1.2 No Keyboard Trap)**:
- Verify user can navigate out of modals/dialogs using Escape or tab
- Verify no component traps keyboard focus
- Verify embedded content (iframes, widgets) does not trap focus

**Skip Links (2.4.1 Bypass Blocks)**:
- Verify skip-to-main-content link is present
- Verify skip link is visible on focus
- Verify skip link correctly moves focus to main content

**Keyboard Accessibility (2.1.1 Keyboard)**:
- Verify all actions available via mouse are also available via keyboard
- Verify Enter/Space activates buttons and links
- Verify arrow keys work in menus, tabs, and radio groups

### Step 3: Generate Screen Reader Tests

For each page, generate tests for:

**ARIA Labels and Roles (4.1.2 Name, Role, Value)**:
- Verify all interactive elements have accessible names
- Verify custom components have appropriate ARIA roles
- Verify ARIA states (expanded, selected, checked) update dynamically

**Heading Hierarchy (1.3.1 Info and Relationships)**:
- Verify heading levels follow logical order (h1 -> h2 -> h3, no skips)
- Verify only one h1 per page
- Verify headings accurately describe content sections

**Landmarks and Regions (1.3.1 Info and Relationships)**:
- Verify page uses landmark roles (banner, navigation, main, contentinfo)
- Verify form groups use fieldset/legend or ARIA group roles
- Verify tables have proper headers and captions

**Live Regions (4.1.3 Status Messages)**:
- Verify status messages use `role="status"` or `aria-live="polite"`
- Verify error messages use `role="alert"` or `aria-live="assertive"`
- Verify progress indicators announce updates to screen readers

**Link and Button Purpose (2.4.4 Link Purpose)**:
- Verify links have descriptive text (no "click here" or "read more" without context)
- Verify buttons have descriptive labels
- Verify icon-only buttons have accessible names

### Step 4: Generate Color and Contrast Tests

For each page, generate tests for:

**Contrast Ratios (1.4.3 Contrast Minimum)**:
- Verify normal text has minimum 4.5:1 contrast ratio
- Verify large text (18pt or 14pt bold) has minimum 3:1 contrast ratio
- Verify contrast requirements are met in all color themes (light/dark mode)

**Non-text Contrast (1.4.11 Non-text Contrast)**:
- Verify UI component boundaries have minimum 3:1 contrast ratio
- Verify graphical objects required for understanding have minimum 3:1 contrast ratio
- Verify focus indicators have minimum 3:1 contrast ratio

**Use of Color (1.4.1 Use of Color)**:
- Verify color is not the sole means of conveying information
- Verify error states use text/icons in addition to color
- Verify required field indicators use more than color alone
- Verify link text is distinguishable from surrounding text without relying solely on color

### Step 5: Generate Form Accessibility Tests

For each page with forms, generate tests for:

**Labels (3.3.2 Labels or Instructions)**:
- Verify all form inputs have visible, associated labels
- Verify labels are programmatically associated via `for`/`id` or wrapping
- Verify placeholder text is not used as a substitute for labels

**Error Identification (3.3.1 Error Identification)**:
- Verify errors are identified in text (not only by color or icon)
- Verify error messages are associated with the relevant input field
- Verify the error message describes the error clearly

**Error Suggestion (3.3.3 Error Suggestion)**:
- Verify error messages include suggestion for correction when possible
- Verify expected format is indicated for constrained inputs (e.g., date, email)

**Input Purpose (1.3.5 Identify Input Purpose)**:
- Verify personal data inputs have appropriate `autocomplete` attributes
- Verify input types are appropriate (email, tel, url, etc.)

**Error Prevention (3.3.4 Error Prevention)**:
- Verify reversible actions for legal/financial/data-deletion forms
- Verify confirmation step before irreversible submissions
- Verify user can review and correct data before submission

### Step 6: Generate Image Accessibility Tests

For each page with images, generate tests for:

**Alt Text (1.1.1 Non-text Content)**:
- Verify informative images have descriptive alt text
- Verify decorative images have empty alt attribute (`alt=""`) or are CSS background images
- Verify alt text conveys the same information as the image
- Verify icon fonts or SVG icons have accessible names

**Complex Images (1.1.1 Non-text Content)**:
- Verify charts and diagrams have detailed text descriptions
- Verify infographics have equivalent text alternatives
- Verify complex images link to or provide long descriptions

**Images of Text (1.4.5 Images of Text)**:
- Verify text is not presented as an image when it can be rendered as text
- Verify exceptions only for logos or essential branding

### Step 7: Generate Dynamic Content Tests

For each page with dynamic content, generate tests for:

**Status Messages (4.1.3 Status Messages)**:
- Verify success messages are announced to screen readers
- Verify loading states are communicated (aria-busy, progress indicators)
- Verify content updates in live regions are announced appropriately

**Content on Hover or Focus (1.4.13 Content on Hover or Focus)**:
- Verify tooltip/popover content is dismissible (Escape key)
- Verify tooltip/popover content is hoverable (user can move pointer over it)
- Verify tooltip/popover content persists until dismissed by user

**Timing Adjustable (2.2.1 Timing Adjustable)**:
- Verify users can extend, adjust, or disable time limits
- Verify session timeout warnings provide at least 20 seconds to respond

**Pause, Stop, Hide (2.2.2 Pause, Stop, Hide)**:
- Verify auto-playing carousels and animations can be paused or stopped
- Verify auto-updating content can be paused

### Step 8: Generate Responsive Design Tests

For each page, generate tests for:

**Reflow (1.4.10 Reflow)**:
- Verify content reflows at 320px viewport width without horizontal scrolling
- Verify no loss of content or functionality at 320px
- Verify content reflows at 256px viewport height for horizontal scrolling content

**Text Resize (1.4.4 Resize Text)**:
- Verify text is readable at 200% browser zoom
- Verify no content overlap or truncation at 200% zoom
- Verify functionality is preserved at 200% zoom

**Text Spacing (1.4.12 Text Spacing)**:
- Verify no content loss with increased line height (1.5x), paragraph spacing (2x), letter spacing (0.12x), word spacing (0.16x)

**Orientation (1.3.4 Orientation)**:
- Verify content is not restricted to a single orientation (portrait or landscape)

### Step 9: Assign Test IDs, Priority, and Test Method

For each generated test case:

**Test ID Format**: `A11Y-{PAGE}-{WCAG-CRITERION}-{NNN}`
- `{PAGE}`: Normalized page name in uppercase (e.g., `LOGIN`, `DASHBOARD`)
- `{WCAG-CRITERION}`: WCAG success criterion number (e.g., `1.1.1`, `2.4.7`)
- `{NNN}`: Zero-padded sequential number starting at `001`
- Example: `A11Y-LOGIN-1.1.1-001`, `A11Y-LOGIN-2.4.7-001`

**Priority Mapping**:
- WCAG Level A criteria -> **P1 (Critical)**: Fundamental accessibility requirements
- WCAG Level AA criteria -> **P2 (High)**: Enhanced accessibility requirements

**Test Method Classification**:
- **Automated**: Tests that can be fully validated using tools like axe-core, Lighthouse, or pa11y
  - Examples: contrast ratios, missing alt text, missing labels, ARIA attribute validation, heading hierarchy
- **Manual**: Tests that require human judgment or screen reader verification
  - Examples: alt text quality, meaningful reading order, keyboard interaction patterns, screen reader announcement quality
- **Semi-automated**: Tests that can be partially automated with manual verification
  - Examples: focus order (automated detection, manual verification of logic), link purpose (automated detection of generic text, manual verification of context)

### Step 10: Quality Validation

Validate each accessibility test case:
- **Specificity**: Test steps reference specific WCAG criterion and page elements
- **Measurability**: Expected results include concrete pass/fail criteria (e.g., "4.5:1 contrast ratio" not "sufficient contrast")
- **Traceability**: Each test traces to source test case(s), requirement key(s), and WCAG criterion
- **Actionability**: Steps are clear enough for a tester unfamiliar with accessibility to execute
- **Tool Recommendations**: Automated tests include recommended tool (axe-core, Lighthouse, WAVE, screen reader name)

## Important Constraints

- Generate test cases for all applicable WCAG 2.1 AA criteria identified in Phase 2
- Do not generate test cases for criteria that are not applicable to the page
- Include both Level A and Level AA criteria (A is prerequisite for AA conformance)
- Use specific, measurable pass/fail criteria in expected results
- Mark each test as manual, automated, or semi-automated
- Include tool recommendations for automated and semi-automated tests
- Match language of original requirements
- Maintain traceability to source test cases and requirement keys
