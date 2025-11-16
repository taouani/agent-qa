# PHASE 21: Generate Test Plan Foundation

Generate test plan foundation including executive summary, test objectives (derived from test cases/test strategies), and scope (based on requirements analyzed and test cases generated) from in-memory structures and files.

**Context**: This phase takes in-memory structures from phases 5-8 (requirements), phases 9-11 (test cases), phases 15-17 (test strategies), phases 12-14 (test charters) and reads files from `agent-qa/requirement/` or `agent-qa/release/` folders to generate test plan foundation. All foundation data is generated in memory and stored for use in phases 22-23.

## Core Responsibilities

1. **Access Multi-Source Input**: Access in-memory structures from all required phases and read files from folders
2. **Generate Executive Summary**: Generate high-level overview of testing scope and objectives
3. **Derive Test Objectives**: Derive test objectives from test cases and test strategies
4. **Define Scope**: Define scope based on requirements analyzed and test cases generated
5. **Store Foundation Data**: Store test plan foundation in memory for phases 22-23

## Workflow

### Step 1: Access In-Memory Requirement Structures

Access requirement data from phases 5-8:

1. **Access Requirement Data**:
   - Access requirement structures from phases 5-8
   - Process both single requirements and multiple requirements (from filters/releases)
   - Access requirement characteristics, dependencies, relationships
   - Access requirement keys, summaries, descriptions, acceptance criteria
   - Access requirement quality scores and completeness indicators

2. **Ensure Requirement Data Availability**:
   - Verify requirement data is available before proceeding
   - Handle missing requirement data gracefully
   - Continue with available data if some requirements are missing

### Step 2: Access In-Memory Test Case Structures

Access test case data from phases 9-11:

1. **Access Test Case Data**:
   - Access test case structures from phases 9-11
   - Access test case details, types (positive, negative, edge cases), coverage
   - Access test case descriptions, preconditions, test steps, expected results
   - Access test case requirement traceability

2. **Consider Test Cases for Objectives and Scope**:
   - Use test cases for test objectives derivation
   - Use test cases for scope definition
   - Ensure test case data is available before proceeding

### Step 3: Access In-Memory Test Strategy Structures

Access test strategy data from phases 15-17:

1. **Access Test Strategy Data**:
   - Access test strategy structures from phases 15-17
   - Access strategy test levels (Integration, System, UAT), test types, automation approach, metrics
   - Access strategy test design techniques

2. **Consider Test Strategies for Objectives**:
   - Use test strategies for test objectives derivation
   - Ensure strategy data is available before proceeding

### Step 4: Access In-Memory Test Charter Structures

Access test charter data from phases 12-14:

1. **Access Test Charter Data**:
   - Access test charter structures from phases 12-14
   - Access charter scope, areas to explore, resource requirements, time estimates
   - Access charter mission/goal and test approach

2. **Consider Charters for Context**:
   - Use charter data for context and understanding
   - Consider charters for schedule planning (in phase 22)
   - Ensure charter data is available before proceeding

### Step 5: Read Files from Context Folders

Read files from `agent-qa/requirement/` or `agent-qa/release/` folders:

1. **Identify Context Folder**:
   - Determine if single requirement (`agent-qa/requirement/`) or release/filter (`agent-qa/release/`)
   - Use context folder from Phase 1

2. **Read Deliverable Files**:
   - Read test case files (from phases 9-11) for reference
   - Read test strategy files (from phases 15-17) for reference
   - Read test charter files (from phases 12-14) for reference
   - Read risk register files (from phases 18-20) for reference
   - Read traceability matrix files (from phase 11) for reference

3. **Extract File References**:
   - Extract file paths and names for linking in test plan
   - Store file references for use in phase 23
   - Handle missing files gracefully (provide informative messages)

### Step 6: Generate Executive Summary

Generate executive summary for the test plan:

1. **Generate High-Level Overview**:
   - Generate high-level overview of testing scope and objectives
   - Summarize key testing activities and deliverables
   - Provide context for stakeholders
   - Keep summary concise and informative

2. **Include Scope Summary**:
   - Summarize requirements included in scope
   - Summarize test cases included in scope
   - Provide high-level context

3. **Include Objectives Summary**:
   - Summarize key test objectives (will be detailed in test objectives section)
   - Provide high-level testing goals

4. **Store Executive Summary**:
   - Store executive summary in memory
   - Prepare for use in phase 23

### Step 7: Derive Test Objectives from Test Cases

Derive test objectives from test cases:

1. **Analyze Test Cases**:
   - Analyze test cases to identify testing goals
   - Extract objectives from test case descriptions and purposes
   - Identify common testing themes across test cases
   - Consider test case types (positive, negative, edge cases)

2. **Extract Objectives**:
   - Extract objectives from test case descriptions
   - Extract objectives from test case purposes
   - Ensure objectives align with test cases
   - Structure objectives clearly

3. **Store Test Case Objectives**:
   - Store objectives derived from test cases
   - Prepare for combination with strategy objectives

### Step 8: Derive Test Objectives from Test Strategies

Derive test objectives from test strategies:

1. **Analyze Test Strategies**:
   - Analyze test strategies to identify testing objectives
   - Extract objectives from test strategy test levels (Integration, System, UAT)
   - Extract objectives from test strategy test types
   - Consider automation approach and metrics

2. **Extract Objectives**:
   - Extract objectives from test levels
   - Extract objectives from test types
   - Ensure objectives align with test strategies
   - Structure objectives clearly

3. **Store Strategy Objectives**:
   - Store objectives derived from test strategies
   - Prepare for combination with test case objectives

### Step 9: Combine and Structure Test Objectives

Combine and structure test objectives:

1. **Combine Objectives**:
   - Combine test objectives from test cases and test strategies
   - Identify duplicate or similar objectives
   - Deduplicate similar objectives while preserving all source information
   - Ensure comprehensive objective coverage

2. **Structure Objectives**:
   - Structure objectives clearly and logically
   - Group related objectives together
   - Ensure objectives are clear and actionable
   - Format objectives for readability

3. **Store Combined Objectives**:
   - Store combined and structured test objectives
   - Prepare for use in phase 23

### Step 10: Define Scope from Requirements Analyzed

Define scope based on requirements analyzed:

1. **List Requirements in Scope**:
   - List requirements included in scope (from phases 5-8)
   - Include requirement keys and summaries
   - Consider entire release/filter scope
   - Ensure requirements are clearly identified

2. **Structure Requirements**:
   - Structure requirements clearly
   - Include requirement references
   - Format requirements for readability

3. **Store Requirements Scope**:
   - Store requirements in scope
   - Prepare for combination with test case scope

### Step 11: Define Scope from Test Cases Generated

Define scope based on test cases generated:

1. **List Test Cases in Scope**:
   - List test cases included in scope (from phases 9-11)
   - Include test case coverage information
   - Consider test case types and coverage
   - Ensure test cases are clearly identified

2. **Structure Test Cases**:
   - Structure test cases clearly
   - Include test case references
   - Format test cases for readability

3. **Store Test Case Scope**:
   - Store test cases in scope
   - Prepare for combination with requirements scope

### Step 12: Define In-Scope and Out-of-Scope Items

Define in-scope and out-of-scope items:

1. **Define In-Scope Items**:
   - Explicitly list what's included in scope
   - Combine requirements and test cases in scope
   - Ensure scope is clear and unambiguous
   - Structure in-scope items clearly

2. **Define Out-of-Scope Items**:
   - Explicitly list what's excluded from scope (if applicable)
   - Identify items not part of current testing scope
   - Ensure out-of-scope is clear and unambiguous
   - Structure out-of-scope items clearly

3. **Store Complete Scope**:
   - Store complete scope definition (in-scope and out-of-scope)
   - Prepare for use in phase 23

### Step 13: Store Test Plan Foundation Data

Store all test plan foundation data in memory:

1. **Store Foundation Components**:
   - Store executive summary
   - Store test objectives (combined from test cases and strategies)
   - Store scope definition (requirements and test cases, in-scope and out-of-scope)
   - Store file references from folders

2. **Maintain Data Relationships**:
   - Maintain test plan-to-source relationships (requirements, test cases, strategies, charters)
   - Ensure data is accessible for phases 22-23
   - Prepare for file output in phase 23

3. **Confirm Foundation Complete**:
   - Verify all foundation components are stored
   - Ensure data is ready for phase 22
   - Proceed to phase 22 when foundation is complete

## Output Confirmation

After completing this phase, you should have:

- ✅ Executive summary generated with high-level overview
- ✅ Test objectives derived from test cases
- ✅ Test objectives derived from test strategies
- ✅ Objectives combined, structured, and deduplicated
- ✅ Scope defined based on requirements analyzed
- ✅ Scope defined based on test cases generated
- ✅ In-scope items explicitly listed
- ✅ Out-of-scope items explicitly listed (if applicable)
- ✅ File references extracted from folders
- ✅ Test plan foundation stored in memory for phases 22-23

## Error Handling

- Handle missing or incomplete data gracefully
- Continue test plan generation even when some sources have issues
- Provide informative messages when data cannot be determined
- Log warnings for test plans that may need manual review
- Handle missing referenced files gracefully (provide informative messages)
- Ensure graceful degradation for missing or incomplete data

