# Language Handling Rules

Rules for automatic language detection and multilingual deliverable generation.

## Detection Rules

- Analyze the requirement's title, description, and acceptance criteria to detect the primary language
- Use a 70% confidence threshold: if 70% or more of the content is in a given language, classify the requirement as that language
- Common languages to detect: English, French, Arabic, Spanish, German, Portuguese, Dutch, Italian
- Store the detected language code in the YAML front matter (`language: fr`, `language: en`, etc.)

## Per-Requirement Language Handling

- Each requirement is independently analyzed for language
- All deliverables generated from a requirement inherit its detected language
- Test case summaries, steps, and expected results are written in the requirement's language
- Test strategy, charter, plan sections relating to a specific requirement use that requirement's language
- Index files and cross-requirement summaries use the majority language across all requirements

## No-Translation Policy

- NEVER translate source content from one language to another
- Write deliverables in the same language as the source requirement
- Technical terms (e.g., "test case", "regression", "smoke test") may remain in English if no standard translation exists in the target language
- Jira keys, IDs, and technical identifiers are always in their original form

## Mixed-Language Releases

When a release contains requirements in multiple languages:

- Generate per-requirement deliverables in each requirement's own language
- Generate the release-level summary in the majority language
- Add a `language` field to each section's YAML front matter
- Group deliverables by language in index files when the language mix exceeds 2 languages
