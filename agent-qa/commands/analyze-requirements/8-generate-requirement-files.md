# PHASE 8: Generate Requirement Files

Generate individual requirement markdown files and summary index in the output folder.

## Core Responsibilities

1. **Generate Individual Files**: Create markdown file for each requirement
2. **Format Files**: Format following markdown standards
3. **Create Summary Index**: Generate index file with links and statistics
4. **Write Files**: Store files in output folder

## Workflow

### Step 1: Get Output Folder Path

Use the folder path from Phase 1:
- Base folder: `agent-qa/YYYY-MM-DD-{folder-name}/`
- Requirements folder: `agent-qa/YYYY-MM-DD-{folder-name}/requirements/`

### Step 2: Generate Individual Requirement Files

For each requirement:
1. Create filename: `requirement-{KEY}.md`
2. Format markdown content with all requirement data
3. Include: Basic info, acceptance criteria, dependencies, relationships, linked content, quality analysis
4. **If commit analysis available** (from Phase 7), include commit information:
   - Code changes summary
   - Commits and PRs/MRs linked to this requirement
   - Files changed
   - Link to detailed commit analysis file (if exists)
5. Write file to requirements folder

### Step 3: Include Commit Information (if available)

If commit analysis was performed in Phase 7, include commit information in requirement files:

For each requirement with commit analysis:
1. **Add Code Changes Section**:
   ```markdown
   ## Code Changes
   
   - **Commits**: [N] commits
   - **PRs/MRs**: [M] PRs/MRs
   - **Files Changed**: [K] files
   - **Summary**: [Brief summary of code changes]
   - **Link**: [Link to commit analysis file: `../commits/{KEY}-commits.md`]
   ```

2. **If No Commits Found**:
   ```markdown
   ## Code Changes
   
   ⚠️ **No code changes found**
   
   No commits or pull requests/merge requests were found correlated with this requirement.
   ```

### Step 4: Calculate Statistics

Calculate summary statistics:
- Total requirements
- Average completeness and quality scores
- Distribution by completeness/quality levels
- Missing acceptance criteria count
- Requirements with code changes (if commit analysis enabled)
- Requirements without code changes (if commit analysis enabled)

### Step 5: Generate Summary Index

Create `requirements-index.md`:
- Include summary statistics
- List all requirements with links
- Include completeness and quality indicators
- If commit analysis enabled, include link to commits folder and commit analysis statistics

### Step 6: Write Files

Write all files to the requirements folder.

## Important Constraints

- Follow markdown standards
- Use descriptive filenames
- Include all requirement data
- Create proper markdown links
- Calculate accurate statistics

