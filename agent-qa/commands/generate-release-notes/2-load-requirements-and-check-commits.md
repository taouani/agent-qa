# PHASE 2: Load Requirements and Check for Commits

Load requirements analysis data from selected folder, check if commit analysis exists, and load all related deliverables.

## Core Responsibilities

1. **Load Requirements Data**: Load requirements analysis data from selected folder
2. **Check for Commit Analysis**: Check if commit analysis exists (`commits/` subfolder)
3. **Call `analyze-commits` if Needed**: Automatically call `analyze-commits` if commit analysis not found
4. **Load Commit Analysis**: Load commit analysis data if available
5. **Load Related Deliverables**: Load test cases, test plans, strategies, charters, risk registers if available
6. **Store Data in Memory**: Store all loaded data in memory for release note generation

## Workflow

### Step 1: Load Requirements Analysis Data

Load requirements analysis data from selected folder:

1. **Read Requirements Index**:
   - Read `requirements-index.md` from selected folder
   - Extract list of requirement files
   - Load requirement metadata

2. **Load Individual Requirement Files**:
   - Read each requirement markdown file
   - Parse requirement data (key, summary, description, acceptance criteria, etc.)
   - Store requirements in memory

3. **Store Requirements Structure**:
   ```
   {
     "requirements": [
       {
         "key": "PROJ-123",
         "summary": "...",
         "description": "...",
         "acceptance_criteria": [...],
         ...
       }
     ]
   }
   ```

### Step 2: Check for Commit Analysis

Check if commit analysis exists for selected folder:

1. **Check for Commits Folder**:
   - Check if `commits/` subfolder exists in selected folder
   - Check if `commits-index.md` exists

2. **If Commit Analysis Found**:
   - Proceed to Step 3 (Load Commit Analysis)

3. **If Commit Analysis Not Found**:
   - Proceed to Step 2.5 (Call `analyze-commits`)

### Step 2.5: Call `analyze-commits` Command

If commit analysis not found:

1. **Output Message**:
   ```
   ⚠️ Commit analysis not found for selected requirements
   
   Automatically calling analyze-commits command...
   ```

2. **Call `analyze-commits` Command**:
   - Extract Jira ticket keys from loaded requirements
   - Construct input for `analyze-commits` (Jira ticket keys or JQL query)
   - Execute `analyze-commits` command workflow
   - Wait for completion

3. **Verify Commit Analysis Created**:
   - Check if `commits/` folder was created
   - Proceed to Step 3

### Step 3: Load Commit Analysis Data

If commit analysis exists (from Step 2 or Step 2.5):

1. **Read Commits Index**:
   - Read `commits-index.md` from `commits/` subfolder
   - Extract list of commit analysis files

2. **Load Individual Commit Analysis Files**:
   - Read each commit analysis markdown file
   - Parse commit/PR data (correlation mapping, code changes, summaries, etc.)
   - Store commit analysis in memory

3. **Store Commit Analysis Structure**:
   ```
   {
     "commits": {
       "PROJ-123": {
         "commits": [...],
         "prs": [...],
         "code_changes": [...]
       }
     }
   }
   ```

### Step 4: Load Test Cases (if available)

Check if test cases exist (`test-cases/` subfolder):

1. **Check for Test Cases Folder**:
   - Check if `test-cases/` subfolder exists
   - Check if test case files exist

2. **If Test Cases Found**:
   - Read test case files
   - Parse test case data
   - Store test cases in memory

3. **Store Test Cases Structure**:
   ```
   {
     "test_cases": [
       {
         "id": "TC-001",
         "summary": "...",
         "requirement_key": "PROJ-123",
         ...
       }
     ]
   }
   ```

### Step 5: Load Test Plans (if available)

Check if test plans exist (`test-plan/` subfolder):

1. **Check for Test Plan Folder**:
   - Check if `test-plan/` subfolder exists
   - Check if test plan files exist

2. **If Test Plans Found**:
   - Read test plan files
   - Parse test plan data
   - Store test plans in memory

### Step 6: Load Test Strategies (if available)

Check if test strategies exist (`test-strategy/` subfolder):

1. **Check for Test Strategy Folder**:
   - Check if `test-strategy/` subfolder exists
   - Check if test strategy files exist

2. **If Test Strategies Found**:
   - Read test strategy files
   - Parse test strategy data
   - Store test strategies in memory

### Step 7: Load Test Charters (if available)

Check if test charters exist (`test-charter/` subfolder):

1. **Check for Test Charter Folder**:
   - Check if `test-charter/` subfolder exists
   - Check if test charter files exist

2. **If Test Charters Found**:
   - Read test charter files
   - Parse test charter data
   - Store test charters in memory

### Step 8: Load Risk Registers (if available)

Check if risk registers exist (`risk-register/` subfolder):

1. **Check for Risk Register Folder**:
   - Check if `risk-register/` subfolder exists
   - Check if risk register files exist

2. **If Risk Registers Found**:
   - Read risk register files
   - Parse risk register data
   - Store risk registers in memory

### Step 9: Store All Data in Memory

Store all loaded data in memory for release note generation:

- Requirements data
- Commit analysis data
- Test cases (if available)
- Test plans (if available)
- Test strategies (if available)
- Test charters (if available)
- Risk registers (if available)

## Important Constraints

- Load all available deliverables (don't fail if some are missing)
- Automatically call `analyze-commits` if commit analysis not found
- Store data in structured format for easy access in next phases
- Handle missing deliverables gracefully (not errors)

## Error Handling

If requirements loading fails:
```
❌ Failed to load requirements: [error message]

Please verify requirements analysis folder is valid.
```

If `analyze-commits` call fails:
```
❌ Failed to analyze commits: [error message]

Please run analyze-commits command manually and try again.
```

Continue loading other deliverables even if some fail.

