import { z } from "zod";
import type { ArtifactSpec } from "../../core/index.js";

/**
 * `document@1` (S4-3) and its draft: one document of a type such as
 * `test-plan`, with the sources it was written from, the type's content and
 * the markdown made from it. Every text holds tokens of the requirements
 * run's vault (<PERSON_1>), never real values; publishing restores them.
 */

export const DOCUMENT_ENGINE_VERSION = "document-1";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const source = z.object({ run: z.string(), sourceHash: hash }).strict();

const documentFields = {
  /** The document type, e.g. `test-plan`. */
  type: z.string(),
  title: z.string(),
  /** `document-1/{type's template version}`. */
  templateVersion: z.string(),
  sources: z
    .object({
      /** Its vault holds the document's tokens. */
      requirements: source,
      testCases: source.optional(),
      testRun: source.optional(),
    })
    .strict(),
  /** The type's content, checked against the type's schema when written. */
  content: z.record(z.string(), z.unknown()),
  markdown: z.string(),
};

export const documentDraftSchema = z.object(documentFields).strict();
export type DocumentDraft = z.infer<typeof documentDraftSchema>;

export const documentSchema = z
  .object({
    ...documentFields,
    review: z
      .object({
        /** Texts the person changed or removed in the review. */
        edited: z.number().int().min(0),
        /** Nobody reviewed (the CLI's --yes). */
        unattended: z.literal(true).optional(),
      })
      .strict(),
  })
  .strict();
export type DocumentArtifact = z.infer<typeof documentSchema>;

export const DOCUMENT_DRAFT_ARTIFACT: ArtifactSpec<DocumentDraft> = { name: "document-draft", schema: "document-draft@1", data: documentDraftSchema, render: (d) => d.markdown };

export const DOCUMENT_ARTIFACT: ArtifactSpec<DocumentArtifact> = {
  name: "document",
  schema: "document@1",
  data: documentSchema,
  render: (d) => (d.review.unattended ? d.markdown.replace(/\n/, "\n\n> Not reviewed: written unattended (--yes).\n") : d.markdown),
};

/** `confluence-page@1` (S4-5): the page a run published its document to. */
export const confluencePageSchema = z
  .object({
    document: source,
    space: z.string(),
    pageId: z.string(),
    version: z.number().int().min(1),
    /** The page by its id: a link with no title in it. */
    url: z.string(),
    action: z.enum(["create", "update"]),
    /** The page title, masked. */
    title: z.string(),
  })
  .strict();
export type ConfluencePage = z.infer<typeof confluencePageSchema>;

export const CONFLUENCE_PAGE_ARTIFACT: ArtifactSpec<ConfluencePage> = {
  name: "confluence-page",
  schema: "confluence-page@1",
  data: confluencePageSchema,
  render: (p) => `# Published to Confluence\n\n${p.action === "create" ? "Created" : "Updated"} page ${p.pageId} (version ${p.version}) in space ${p.space}: ${p.url}\n\nTitle: ${p.title}\n`,
};
