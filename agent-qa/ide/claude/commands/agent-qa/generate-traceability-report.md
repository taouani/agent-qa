# Generate Traceability Report Command

You are generating a cross-deliverable traceability report that maps requirements through all generated deliverables.

This command scans an output folder and builds a comprehensive coverage matrix showing the relationship between requirements, test cases, Gherkin features, and Playwright specs.

**Input**: User selection of output folder
**Output**: Traceability report in `agent-qa/YYYY-MM-DD-{context}/traceability-report.md`

Carefully read and execute the instructions in the following files IN SEQUENCE.

{{PHASE 1: @agent-qa/commands/generate-traceability-report/1-find-and-select-output-folder.md}}

{{PHASE 2: @agent-qa/commands/generate-traceability-report/2-build-traceability-matrix.md}}

{{PHASE 3: @agent-qa/commands/generate-traceability-report/3-generate-report-files.md}}
