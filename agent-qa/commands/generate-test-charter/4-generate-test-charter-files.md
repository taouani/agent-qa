# PHASE 4: Generate Test Charter Files

Generate test charter markdown files in the appropriate output folder.

## Core Responsibilities

1. **Determine Output Structure**: Determine if one charter per requirement or one charter per release
2. **Create File Naming Logic**: Generate appropriate filenames
3. **Format Files**: Format charter content as markdown
4. **Write Files**: Write files to test-charter folder
5. **Create Summary Index**: Create index file with links to charters

## Workflow

### Step 1: Determine Output Structure

Based on input type from selected folder:
- **Single Issue**: Generate one charter per requirement
- **Release/Filter**: Generate one charter for entire release OR one per requirement (based on scope)

### Step 2: Create File Naming Logic

Generate filenames:
- Single charter: `test-charter.md`
- Multiple charters: `test-charter-{KEY}.md`
- Index file: `test-charter-index.md`

### Step 3: Format Charter Files

Format charter content as markdown:

```markdown
# Test Charter: {Mission/Goal}

## Mission/Goal
{mission statement}

## Scope

### In-Scope
{list of in-scope items}

### Out-of-Scope
{list of out-of-scope items}

## Areas to Explore
{list of areas to explore}

## Test Approach
{test approach description}

## Risks
{list of risks}

## Resources

### Roles
{roles needed}

### Skills
{skills required}

### Tools
{tools required}

## Time Estimates
{time estimates}
```

### Step 4: Write Files

Write charter files to:
- Output folder: `agent-qa/YYYY-MM-DD-{folder-name}/test-charter/`
- Ensure folder exists
- Write all charter files

### Step 5: Create Summary Index

Create `test-charter-index.md`:
- List all charters with links
- Include summary information
- Link back to requirements

## Important Constraints

- Follow markdown standards
- Use appropriate file naming
- Include all charter fields
- Create proper markdown links

