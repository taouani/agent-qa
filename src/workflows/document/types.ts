import type { z } from "zod";
import type { OutputError } from "../../core/index.js";
import type { RequirementsArtifact } from "../requirements/artifact.js";
import type { TestCases } from "../test-cases/artifact.js";
import type { TestRun } from "../run-tests/workflow.js";

/**
 * One document type of the `document` engine (S4-3, decision F1): one
 * schema, one prompt and one view per type, on one workflow. A type declares
 * which earlier artifacts it reads; the engine loads them, gives the model a
 * masked context, checks the answer, lets the person review it and writes
 * `document@1`.
 */

/** What a document is written from: always requirements, the rest as the type needs. */
export interface DocumentSources {
  requirements: { run: string; data: RequirementsArtifact };
  testCases?: { run: string; data: TestCases } | undefined;
  testRun?: { run: string; data: TestRun } | undefined;
}

export type SourceNeed = "required" | "optional" | "unused";

export interface DocumentType<T> {
  /** The `type` input, e.g. `test-plan`. */
  id: string;
  /** "Test plan". */
  title: string;
  /** Changes when the prompt or schema does, so a `sourceHash` tells documents of older templates apart. */
  templateVersion: string;
  needs: { testCases: SourceNeed; testRun: SourceNeed };
  schema: z.ZodType<T>;
  instructions: string;
  /**
   * What the model sees, from masked sources only. Tokens of a test run come
   * from that run's own vault, so the engine shows them as [masked] first.
   */
  context: (sources: DocumentSources) => unknown;
  /** Checks the schema can't express (every requirement named once, ids that exist). Tokens are checked by the engine. */
  check: (sources: DocumentSources, content: T) => OutputError[];
  /** The document as markdown, from the content and the sources (a coverage table needs the cases). */
  render: (content: T, sources: DocumentSources, meta: DocumentMeta) => string;
}

/** What a rendered document says about where it came from. */
export interface DocumentMeta {
  title: string;
  requirementsRun: string;
  testCasesRun?: string | undefined;
  testRunRun?: string | undefined;
  /** The input of the requirements run: a key, or a sealed JQL filter. */
  input: string;
}
