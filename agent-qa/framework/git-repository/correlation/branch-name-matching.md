# Branch Name Matching

Correlation method for matching Jira keys in branch names.

## Purpose

This instruction file provides reusable logic for extracting Jira keys from branch names, enabling correlation between git branches and Jira tickets.

## Core Responsibilities

1. **Define Branch Name Patterns**: Document common branch name patterns containing Jira keys
2. **Extract Jira Keys**: Use regex patterns to extract Jira keys from branch names
3. **Return Matches**: Return list of extracted Jira keys

## Branch Name Patterns

Common patterns for branches containing Jira keys:

- `{JIRA-KEY}` - Exact match (e.g., "PROJ-123")
- `{JIRA-KEY}-*` - Jira key with suffix (e.g., "PROJ-123-feature", "PROJ-123-bugfix")
- `{JIRA-KEY}_*` - Jira key with underscore suffix (e.g., "PROJ-123_rc", "PROJ-123_dev")
- `{JIRA-KEY}/*` - Jira key with slash (e.g., "PROJ-123/feature-branch")
- `*{JIRA-KEY}*` - Jira key anywhere in branch name

## Regex Patterns

### Pattern 1: Exact Match or Prefix

```
^([A-Z]+-\d+)
```

Matches: "PROJ-123", "PROJ-123-feature", "PROJ-123_rc"

### Pattern 2: Jira Key Anywhere

```
([A-Z]+-\d+)
```

Matches: Jira key anywhere in branch name

### Pattern 3: Multiple Jira Keys

```
([A-Z]+-\d+)
```

With global flag to find all matches in branch name

## Workflow

### Step 1: Get Branch Names

Retrieve branch names from branch listing operation (see `operations/branch-listing.md`).

### Step 2: Apply Regex Patterns

For each branch name, apply regex patterns to extract Jira keys:

1. **Try Exact/Prefix Pattern**: Match Jira key at start of branch name
2. **Try Anywhere Pattern**: Match Jira key anywhere in branch name
3. **Extract All Matches**: Find all Jira keys in branch name (if multiple)

### Step 3: Return Correlation Mapping

Return mapping of Jira keys to branch names:

```json
{
  "PROJ-123": ["PROJ-123-feature", "PROJ-123_rc"],
  "PROJ-124": ["PROJ-124-bugfix"]
}
```

## Usage Example

```markdown
## Step 1: Match Branches to Jira Keys

Follow the instructions in: `agent-qa/framework/git-repository/correlation/branch-name-matching.md`

Input: List of branch names from branch listing operation
Output: Mapping of Jira keys to matching branch names
```

## Important Notes

- Jira key format: `[PROJECT-KEY]-[NUMBER]` (e.g., "PROJ-123")
- Case-sensitive matching (Jira keys are typically uppercase)
- Multiple Jira keys can appear in a single branch name
- Framework handles all correlation methods together (see `correlation/unified-correlation.md`)

