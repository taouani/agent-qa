# Commit Message Parsing

Correlation method for extracting Jira keys from commit messages.

## Purpose

This instruction file provides reusable logic for extracting Jira keys from commit messages, enabling correlation between git commits and Jira tickets.

## Core Responsibilities

1. **Define Commit Message Patterns**: Document common commit message patterns containing Jira keys
2. **Extract Jira Keys**: Use regex patterns to extract Jira keys from commit messages
3. **Handle Multiple Keys**: Extract all Jira keys from a single commit message
4. **Return Matches**: Return list of extracted Jira keys

## Commit Message Patterns

Common patterns for commit messages containing Jira keys:

- `{JIRA-KEY}: Description` - Jira key at start with colon (e.g., "PROJ-123: Fix bug")
- `[{JIRA-KEY}] Description` - Jira key in brackets (e.g., "[PROJ-123] Fix bug")
- `fixes {JIRA-KEY}` - Jira key after "fixes" keyword (e.g., "fixes PROJ-123")
- `closes {JIRA-KEY}` - Jira key after "closes" keyword (e.g., "closes PROJ-123")
- `{JIRA-KEY} {JIRA-KEY}` - Multiple Jira keys (e.g., "PROJ-123 PROJ-124 Multiple keys")

## Regex Patterns

### Pattern 1: Jira Key at Start with Colon

```
^([A-Z]+-\d+):
```

Matches: "PROJ-123: Fix bug"

### Pattern 2: Jira Key in Brackets

```
\[([A-Z]+-\d+)\]
```

Matches: "[PROJ-123] Fix bug"

### Pattern 3: Jira Key After Keywords

```
(?:fixes|closes|resolves|relates to)\s+([A-Z]+-\d+)
```

Matches: "fixes PROJ-123", "closes PROJ-124"

### Pattern 4: Jira Key Anywhere

```
([A-Z]+-\d+)
```

With global flag to find all matches in commit message

## Workflow

### Step 1: Get Commit Messages

Retrieve commit messages from commit search operation (see `operations/commit-search.md`).

### Step 2: Apply Regex Patterns

For each commit message, apply regex patterns to extract Jira keys:

1. **Try Start Pattern**: Match Jira key at start of message
2. **Try Bracket Pattern**: Match Jira key in brackets
3. **Try Keyword Pattern**: Match Jira key after keywords
4. **Try Anywhere Pattern**: Match Jira key anywhere in message
5. **Extract All Matches**: Find all Jira keys in commit message (if multiple)

### Step 3: Return Correlation Mapping

Return mapping of Jira keys to commits:

```json
{
  "PROJ-123": ["commit-hash-1", "commit-hash-2"],
  "PROJ-124": ["commit-hash-3"]
}
```

## Usage Example

```markdown
## Step 1: Parse Commit Messages for Jira Keys

Follow the instructions in: `agent-qa/framework/git-repository/correlation/commit-message-parsing.md`

Input: List of commit messages from commit search operation
Output: Mapping of Jira keys to matching commit hashes
```

## Important Notes

- Jira key format: `[PROJECT-KEY]-[NUMBER]` (e.g., "PROJ-123")
- Case-sensitive matching (Jira keys are typically uppercase)
- Multiple Jira keys can appear in a single commit message
- Framework handles all correlation methods together (see `correlation/unified-correlation.md`)

