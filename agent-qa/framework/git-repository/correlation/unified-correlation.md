# Unified Correlation

Unified interface combining all correlation methods to correlate commits/PRs with Jira tickets.

## Purpose

This instruction file provides a unified workflow for correlating git commits and pull requests/merge requests with Jira tickets using all available correlation methods simultaneously.

## Core Responsibilities

1. **Use All Correlation Methods**: Apply all correlation methods together
2. **Combine Results**: Merge correlation results from all methods
3. **Return Unified Mapping**: Return comprehensive correlation mapping

## Correlation Methods

The unified correlation uses all available methods:

1. **Branch Name Matching** (see `correlation/branch-name-matching.md`)
2. **Commit Message Parsing** (see `correlation/commit-message-parsing.md`)
3. **PR/MR Matching** (see `correlation/pr-mr-matching.md`)

## Workflow

### Step 1: Get Input Data

Retrieve data for correlation:

1. **Jira Ticket Keys**: List of Jira ticket keys to correlate
2. **Branches**: List of branches (from `operations/branch-listing.md`)
3. **Commits**: List of commits (from `operations/commit-search.md`)
4. **PRs/MRs**: List of PRs/MRs (from `operations/pr-mr-retrieval.md`)

### Step 2: Apply Branch Name Matching

Follow instructions in `correlation/branch-name-matching.md`:

- Match branches to Jira keys
- Store correlation: Jira key → list of branch names

### Step 3: Apply Commit Message Parsing

Follow instructions in `correlation/commit-message-parsing.md`:

- Parse commit messages for Jira keys
- Store correlation: Jira key → list of commit hashes

### Step 4: Apply PR/MR Matching

Follow instructions in `correlation/pr-mr-matching.md`:

- Match PRs/MRs to Jira keys
- Store correlation: Jira key → list of PR/MR IDs

### Step 5: Combine Correlation Results

Merge all correlation results into unified mapping:

```json
{
  "PROJ-123": {
    "branches": ["PROJ-123-feature", "PROJ-123_rc"],
    "commits": ["abc123...", "def456..."],
    "prs_mrs": ["123", "124"]
  },
  "PROJ-124": {
    "branches": ["PROJ-124-bugfix"],
    "commits": ["ghi789..."],
    "prs_mrs": ["125"]
  }
}
```

### Step 6: Return Unified Correlation Mapping

Return comprehensive correlation mapping with all correlation methods combined.

## Usage Example

```markdown
## Step 1: Correlate Commits/PRs with Jira Tickets

Follow the instructions in: `agent-qa/framework/git-repository/correlation/unified-correlation.md`

Input:
- Jira ticket keys: ["PROJ-123", "PROJ-124"]
- Branches: [from branch listing]
- Commits: [from commit search]
- PRs/MRs: [from PR/MR retrieval]

Output: Unified correlation mapping
```

## Important Notes

- All correlation methods are applied simultaneously for comprehensive matching
- Results from all methods are combined into a single mapping
- Framework handles platform-specific differences transparently
- Correlation is performed across all available data sources

