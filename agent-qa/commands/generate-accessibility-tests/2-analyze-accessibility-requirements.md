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

### Step 2: Catalog UI Elements Per Page

For each page, scan test case steps and expected results to identify UI elements:

| Element Category | Examples to Detect |
|-----------------|-------------------|
| **Forms** | Input fields, text areas, checkboxes, radio buttons, select dropdowns, date pickers |
| **Buttons** | Submit buttons, action buttons, toggle buttons, icon buttons |
| **Images** | Photos, icons, logos, decorative images, charts, diagrams |
| **Tables** | Data tables, sortable tables, paginated tables |
| **Navigation** | Menus, breadcrumbs, tabs, sidebar navigation, pagination |
| **Modals/Dialogs** | Confirmation dialogs, form modals, alert dialogs, tooltips |
| **Alerts/Notifications** | Success messages, error messages, warning banners, toast notifications |
| **Links** | Text links, image links, skip links |
| **Media** | Video players, audio players, embedded content |
| **Dynamic Content** | Loading spinners, live updates, infinite scroll, accordions |

### Step 3: Identify Interaction Patterns

For each page, determine the interaction patterns present:

- **Keyboard interactions**: Tab navigation, Enter/Space activation, Escape to close, arrow key navigation
- **Mouse interactions**: Click, hover, drag-and-drop, right-click context menus
- **Touch interactions**: Tap, swipe, pinch-to-zoom, long press
- **Form interactions**: Text input, selection, file upload, form submission, inline validation

### Step 4: Identify Content Types

For each page, classify the content types:

- **Text content**: Headings, paragraphs, labels, instructions, error messages
- **Image content**: Informative images, decorative images, complex images (charts, infographics)
- **Video/Audio content**: Pre-recorded media, live media, captions, transcripts
- **Dynamic content**: Status messages, live regions, auto-updating content, loading states
- **Structured content**: Tables, lists, definition lists

### Step 5: Map to WCAG 2.1 AA Success Criteria

For each page, determine the applicable WCAG 2.1 AA success criteria based on the elements, interactions, and content types identified:

#### Perceivable

| Criterion | Name | Applies When |
|-----------|------|-------------|
| 1.1.1 | Non-text Content (A) | Images, icons, charts, buttons with images |
| 1.2.1 | Audio-only and Video-only (A) | Pre-recorded audio or video without alternatives |
| 1.2.2 | Captions (A) | Pre-recorded video with audio |
| 1.2.3 | Audio Description or Media Alternative (A) | Pre-recorded video |
| 1.2.5 | Audio Description (AA) | Pre-recorded video |
| 1.3.1 | Info and Relationships (A) | Forms, tables, headings, lists, landmarks |
| 1.3.2 | Meaningful Sequence (A) | Content where reading order matters |
| 1.3.3 | Sensory Characteristics (A) | Instructions referencing shape, size, location, sound |
| 1.3.4 | Orientation (AA) | Content locked to single orientation |
| 1.3.5 | Identify Input Purpose (AA) | Form inputs for user personal data |
| 1.4.1 | Use of Color (A) | Status indicators, required fields, links, errors |
| 1.4.2 | Audio Control (A) | Auto-playing audio |
| 1.4.3 | Contrast (Minimum) (AA) | All text content |
| 1.4.4 | Resize Text (AA) | All text content |
| 1.4.5 | Images of Text (AA) | Text rendered as images |
| 1.4.10 | Reflow (AA) | All content at 320px viewport |
| 1.4.11 | Non-text Contrast (AA) | UI components and graphical objects |
| 1.4.12 | Text Spacing (AA) | All text content |
| 1.4.13 | Content on Hover or Focus (AA) | Tooltips, popovers, dropdown menus |

#### Operable

| Criterion | Name | Applies When |
|-----------|------|-------------|
| 2.1.1 | Keyboard (A) | All interactive elements |
| 2.1.2 | No Keyboard Trap (A) | Modals, embedded content, custom widgets |
| 2.1.4 | Character Key Shortcuts (A) | Single-character keyboard shortcuts |
| 2.2.1 | Timing Adjustable (A) | Session timeouts, auto-refreshing content |
| 2.2.2 | Pause, Stop, Hide (A) | Carousels, animations, auto-updating content |
| 2.3.1 | Three Flashes or Below Threshold (A) | Animations, video content |
| 2.4.1 | Bypass Blocks (A) | Repeated navigation across pages |
| 2.4.2 | Page Titled (A) | All pages |
| 2.4.3 | Focus Order (A) | All interactive elements |
| 2.4.4 | Link Purpose (In Context) (A) | All links |
| 2.4.5 | Multiple Ways (AA) | Site-wide navigation |
| 2.4.6 | Headings and Labels (AA) | Pages with headings, form labels |
| 2.4.7 | Focus Visible (AA) | All focusable elements |
| 2.5.1 | Pointer Gestures (A) | Multi-point or path-based gestures |
| 2.5.2 | Pointer Cancellation (A) | Mouse/touch click actions |
| 2.5.3 | Label in Name (A) | UI components with visible labels |
| 2.5.4 | Motion Actuation (A) | Shake, tilt, or motion-triggered actions |

#### Understandable

| Criterion | Name | Applies When |
|-----------|------|-------------|
| 3.1.1 | Language of Page (A) | All pages |
| 3.1.2 | Language of Parts (AA) | Pages with mixed-language content |
| 3.2.1 | On Focus (A) | All focusable elements |
| 3.2.2 | On Input (A) | All form inputs |
| 3.2.3 | Consistent Navigation (AA) | Repeated navigation across pages |
| 3.2.4 | Consistent Identification (AA) | Repeated UI components across pages |
| 3.3.1 | Error Identification (A) | Form validation errors |
| 3.3.2 | Labels or Instructions (A) | All form inputs |
| 3.3.3 | Error Suggestion (AA) | Form validation with known correct formats |
| 3.3.4 | Error Prevention (Legal, Financial, Data) (AA) | Forms with legal, financial, or data deletion actions |

#### Robust

| Criterion | Name | Applies When |
|-----------|------|-------------|
| 4.1.1 | Parsing (A) | All pages (deprecated in WCAG 2.2 but still AA in 2.1) |
| 4.1.2 | Name, Role, Value (A) | Custom UI components, ARIA usage |
| 4.1.3 | Status Messages (AA) | Toast notifications, form validation messages, progress indicators |

### Step 6: Load WCAG Mapping Template

Load the format template for accessibility test case structure:
1. Check for custom template first: `agent-qa/custom-templates/accessibility/wcag-mapping-template.md`
2. If not found, use default: `agent-qa/formats/accessibility/wcag-mapping-template.md`

Read and store the template for use in Phase 3.

### Step 7: Store Results

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
