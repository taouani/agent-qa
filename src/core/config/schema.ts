import { z } from "zod";

/**
 * Contract 1: `agent-qa.yaml`. Every section is optional except `version`;
 * each workflow checks only the sections it needs.
 */

/** `${env:NAME}` or `${keychain:NAME}`. Secrets in the file must be one of these. */
export const SECRET_REF = /^\$\{(env|keychain):([A-Za-z_][A-Za-z0-9_.-]*)\}$/;

const secretRef = z
  .string()
  .regex(SECRET_REF, "must be a secret reference like ${env:NAME} or ${keychain:NAME}, never the secret itself");

/** URLs must use `//` and never carry credentials (`user:pass@host`). */
function url(protocol: RegExp, label: string) {
  return z
    .url({ protocol, error: `must be an ${label} URL` })
    .refine((v) => /^[a-z]+:\/\//i.test(v), `must be an ${label} URL`)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.username === "" && u.password === "";
      } catch {
        return false;
      }
    }, "must not contain a username or password; put credentials in a secret reference");
}
const httpsUrl = url(/^https$/, "https://");
const anyUrl = url(/^https?$/, "http(s)://");

export const PROVIDERS = ["anthropic", "openai", "mistral", "xai", "google", "openrouter", "litellm"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** `provider:model`, e.g. `anthropic:<model-id>`. */
const modelId = z
  .string()
  .regex(new RegExp(`^(${PROVIDERS.join("|")}):[A-Za-z0-9._/@-]+$`), `must be provider:model with provider one of ${PROVIDERS.join(", ")}`);

/** `provider:*` or an exact `provider:model`. */
const modelPattern = z
  .string()
  .regex(new RegExp(`^(${PROVIDERS.join("|")}):([A-Za-z0-9._/@-]+|\\*)$`), "must be provider:model or provider:*");

const writePolicy = z.enum(["allow", "ask", "deny"]);

export const configSchema = z
  .object({
    version: z.literal(1),

    project: z.object({ name: z.string().min(1) }).strict().optional(),

    atlassian: z
      .object({
        site: httpsUrl,
        /** Personal data if written literally; prefer ${env:ATLASSIAN_EMAIL} so it stays out of git. */
        email: z.string().min(1),
        token: secretRef,
        confluence: z.object({ spaceKey: z.string().min(1), parentPageId: z.string().min(1).optional() }).strict().optional(),
        /** How requirements are read from Jira. Every key has a default. */
        jira: z
          .object({
            /** Field id or name holding acceptance criteria. Default: found by name; else read from the description. */
            acceptanceCriteriaField: z.string().min(1).optional(),
            /** More text fields to read into each requirement, by id or name. */
            extraFields: z.array(z.string().min(1)).optional(),
            /** Levels of child issues below each input issue. Default 3. */
            maxDepth: z.number().int().min(0).max(5).optional(),
            /** Most issues per run. Default 100. */
            maxIssues: z.number().int().min(1).max(500).optional(),
            /** Follow issue links one level out. Default true. */
            followLinks: z.boolean().optional(),
            /** Also read the children of linked issues. Default true. */
            followLinkedChildren: z.boolean().optional(),
            /** Most linked Confluence pages per run. Default 20. */
            maxPages: z.number().int().min(0).max(100).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),

    xray: z
      .object({ clientId: z.string().min(1), clientSecret: secretRef, projectKey: z.string().regex(/^[A-Z][A-Z0-9_]+$/) })
      .strict()
      .optional(),

    git: z
      .object({
        platform: z.enum(["github", "gitlab", "azure-devops"]),
        repo: z.string().min(1),
        token: secretRef,
        baseUrl: anyUrl.optional(),
      })
      .strict()
      .optional(),

    salesforce: z
      .object({ baseUrl: httpsUrl, auth: z.enum(["storage-state"]).default("storage-state") })
      .strict()
      .optional(),

    models: z
      .object({
        default: modelId,
        /** Narrows the shipped catalog. A model outside the catalog is allowed, with a doctor warning. */
        allowed: z.array(modelPattern).min(1).optional(),
        workflows: z.record(z.string(), modelId).optional(),
        keys: z.partialRecord(z.enum(PROVIDERS), secretRef).optional(),
        /** Base URLs for OpenRouter or a LiteLLM proxy. */
        endpoints: z.partialRecord(z.enum(PROVIDERS), anyUrl).optional(),
      })
      .strict()
      .optional(),

    masking: z
      .object({
        restoreOnWrite: z.boolean().default(false),
        detectors: z.array(z.enum(["email", "phone", "iban", "card", "national-id", "name", "address", "ip"])).optional(),
        /** Fields always replaced whole, by source: `jira: [customfield_10042, "Customer phone"]`. */
        fields: z.record(z.string(), z.array(z.string().min(1))).optional(),
        /** Languages for finding names that no people field lists. Default: all nine. */
        languages: z.array(z.enum(["en", "fr", "es", "de", "pt", "nl", "it", "ar", "zh"])).optional(),
        presidio: z.object({ url: anyUrl.nullable() }).strict().optional(),
      })
      .strict()
      .default(() => ({ restoreOnWrite: false })),

    policy: z
      .object({
        writes: z
          .object({
            xray: writePolicy.default("ask"),
            confluence: writePolicy.default("ask"),
            testCode: writePolicy.default("ask"),
            jira: writePolicy.default("deny"),
          })
          .strict()
          // Factory defaults: each parse gets its own object, so a caller can't change another's defaults.
          .default(() => ({ xray: "ask" as const, confluence: "ask" as const, testCode: "ask" as const, jira: "deny" as const })),
      })
      .strict()
      .default(() => ({ writes: { xray: "ask" as const, confluence: "ask" as const, testCode: "ask" as const, jira: "deny" as const } })),

    harness: z
      .object({
        sources: z
          .array(
            z.union([
              z.object({ fixtures: z.string().min(1) }).strict(),
              z.object({ jira: z.object({ jql: z.string().min(1) }).strict() }).strict(),
            ]),
          )
          .min(1),
        seededPersonalData: z.string().min(1).optional(),
      })
      .strict()
      .optional(),

    playwright: z
      .object({
        baseUrl: anyUrl.default("http://localhost:3000"),
        testDir: z.string().min(1).default("tests"),
        profile: z.string().min(1).default(".agent-qa/framework-profile.json"),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Config as written (defaults not yet applied). */
export type ConfigInput = z.input<typeof configSchema>;
/** Config after validation, with defaults applied. */
export type Config = z.output<typeof configSchema>;
