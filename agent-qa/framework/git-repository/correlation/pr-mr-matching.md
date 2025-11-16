# PR/MR Matching

Correlation method for matching Jira keys in PR/MR metadata (title, description, labels, custom fields).

## Purpose

This instruction file provides reusable logic for extracting Jira keys from PR/MR metadata, enabling correlation between pull requests/merge requests and Jira tickets.

## Core Responsibilities

1. **Define PR/MR Patterns**: Document patterns for extracting Jira keys from PR/MR metadata
2. **Extract from Title**: Extract Jira keys from PR/MR titles
3. **Extract from Description**: Extract Jira keys from PR/MR descriptions
4. **Extract from Labels**: Extract Jira keys from PR/MR labels
5. **Extract from Custom Fields**: Extract Jira keys from PR/MR custom fields (if applicable)
6. **Return Matches**: Return list of extracted Jira keys

## PR/MR Patterns

### Title Patterns

- `{JIRA-KEY}: Description` - Jira key at start with colon
- `[{JIRA-KEY}] Description` - Jira key in brackets
- `{JIRA-KEY}` - Jira key anywhere in title

### Description Patterns

- `{JIRA-KEY}` - Jira key anywhere in description
- `fixes {JIRA-KEY}` - Jira key after "fixes" keyword
- `closes {JIRA-KEY}` - Jira key after "closes" keyword
- `relates to {JIRA-KEY}` - Jira key after "relates to" keyword

### Label Patterns

- `{JIRA-KEY}` - Exact match label
- `*{JIRA-KEY}*` - Jira key in label name

### Custom Field Patterns

- Platform-specific custom fields containing Jira keys
- Varies by platform (GitLab, GitHub, Azure DevOps)

## Regex Patterns

Use same patterns as commit message parsing (see `correlation/commit-message-parsing.md`):

- `^([A-Z]+-\d+):` - Jira key at start with colon
- `\[([A-Z]+-\d+)\]` - Jira key in brackets
- `(?:fixes|closes|relates to)\s+([A-Z]+-\d+)` - Jira key after keywords
- `([A-Z]+-\d+)` - Jira key anywhere (with global flag)

## Workflow

### Step 1: Get PR/MR Data

Retrieve PR/MR data from PR/MR retrieval operation (see `operations/pr-mr-retrieval.md`).

### Step 2: Extract from Title

For each PR/MR, extract Jira keys from title using regex patterns.

### Step 3: Extract from Description

For each PR/MR, extract Jira keys from description using regex patterns.

### Step 4: Extract from Labels

For each PR/MR, extract Jira keys from labels (if labels available).

### Step 5: Extract from Custom Fields

For each PR/MR, extract Jira keys from custom fields (platform-specific, if available).

### Step 6: Combine and Return

Combine all extracted Jira keys and return correlation mapping:

```json
{
  "PROJ-123": ["pr-123", "mr-456"],
  "PROJ-124": ["pr-789"]
}
```

## Usage Example

```markdown
## Step 1: Match PRs/MRs to Jira Keys

Follow the instructions in: `agent-qa/framework/git-repository/correlation/pr-mr-matching.md`

Input: List of PRs/MRs from PR/MR retrieval operation
Output: Mapping of Jira keys to matching PR/MR IDs
```

## Important Notes

- Jira key format: `[PROJECT-KEY]-[NUMBER]` (e.g., "PROJ-123")
- Case-sensitive matching (Jira keys are typically uppercase)
- Multiple Jira keys can appear in PR/MR metadata
- Custom fields are platform-specific and may not be available on all platforms
- Framework handles all correlation methods together (see `correlation/unified-correlation.md`)

