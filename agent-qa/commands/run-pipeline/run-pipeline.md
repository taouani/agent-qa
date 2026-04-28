# Run Pipeline Command

You are executing a sequence of Agent-QA commands in dependency order as a single pipeline.

This command allows running multiple commands automatically, passing context between them.

**Input**: Pipeline specification (start/end commands, or command list)
**Output**: All deliverables from each command in the pipeline

Carefully read and execute the instructions in the following files IN SEQUENCE.

{{PHASE 1: @agent-qa/commands/run-pipeline/1-parse-pipeline-config.md}}

{{PHASE 2: @agent-qa/commands/run-pipeline/2-execute-pipeline.md}}

{{PHASE 3: @agent-qa/commands/run-pipeline/3-generate-pipeline-summary.md}}
