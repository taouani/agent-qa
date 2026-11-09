import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Document } from "yaml";
import { z } from "zod";
import { configSchema, SECRET_REF, type Config } from "./schema.js";

export const CONFIG_FILE_NAMES = ["agent-qa.yaml", "agent-qa.yml"] as const;

export interface ConfigProblem {
  /** Dotted path into the config, e.g. `atlassian.token`. `$` is the root. */
  path: string;
  message: string;
  /** 1-based line in the file, when known. */
  line?: number;
}

export class ConfigError extends Error {
  constructor(
    readonly file: string,
    readonly problems: ConfigProblem[],
    /** NOT_FOUND when there is no config file at all. */
    readonly code: "INVALID" | "NOT_FOUND" = "INVALID",
  ) {
    super(
      `Invalid config ${file}:\n` +
        problems.map((p) => `  ${p.line ? `line ${p.line}: ` : ""}${p.path}: ${p.message}`).join("\n"),
    );
    this.name = "ConfigError";
  }
}

export interface LoadedConfig {
  file: string;
  config: Config;
  /** The sf-agent-qa version in the file's `yaml-language-server` schema line, when it points at the published schema. */
  schemaVersion?: string;
}

const SCHEMA_LINE = /^#\s*yaml-language-server:\s*\$schema=https:\/\/unpkg\.com\/sf-agent-qa@([^/\s]+)\/schema\/agent-qa\.schema\.json\s*$/m;

/**
 * Common token shapes. A match anywhere in the file is an error, even in a
 * field that isn't marked secret, so a pasted key never sits in git.
 */
const LITERAL_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, "GitHub token"],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, "GitLab token"],
  [/\bsk-(ant|proj|or|svcacct)-[A-Za-z0-9_-]{20,}/, "API key"],
  [/\bsk-(?=[A-Za-z0-9]*[0-9])(?=[A-Za-z0-9]*[A-Z])[A-Za-z0-9]{32,}\b/, "API key"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bxai-[A-Za-z0-9]{20,}\b/, "xAI key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bATATT[A-Za-z0-9_=-]{20,}\b/, "Atlassian API token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
];

/** What kind of secret `text` looks like (`GitHub token`), or undefined. */
export function literalSecretKind(text: string): string | undefined {
  return LITERAL_SECRET_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
}

function lineOf(doc: Document, counter: LineCounter, path: ReadonlyArray<PropertyKey>): number | undefined {
  // Walk up until a node with a range exists (missing keys have none).
  for (let n = path.length; n >= 0; n--) {
    const node = n === 0 ? doc.contents : doc.getIn(path.slice(0, n) as unknown[], true);
    const range = (node as { range?: [number, number, number] } | null | undefined)?.range;
    if (range) return counter.linePos(range[0]).line;
  }
  return undefined;
}

function dotted(path: ReadonlyArray<PropertyKey>): string {
  return path.length === 0 ? "$" : path.map(String).join(".");
}

function looksSecret(value: string): string | undefined {
  return LITERAL_SECRET_PATTERNS.find(([pattern]) => pattern.test(value))?.[1];
}

function scanLiteralSecrets(doc: Document, counter: LineCounter): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const report = (node: { range?: [number, number, number] | null }, path: Array<string | number>, kind: string, where: string) => {
    const line = node.range ? counter.linePos(node.range[0]).line : undefined;
    problems.push({
      path: dotted(path),
      message: `${where} looks like a literal ${kind}. Remove it from the file, rotate it, and use \${env:NAME} or \${keychain:NAME}`,
      ...(line ? { line } : {}),
    });
  };
  const visit = (node: unknown, path: Array<string | number>) => {
    if (isMap(node)) {
      for (const item of node.items) {
        const key = isScalar(item.key) ? String(item.key.value) : String(item.key);
        const kind = looksSecret(key);
        if (kind && isScalar(item.key)) {
          // Never put the key itself in the path: it's the secret.
          report(item.key, [...path, "<key>"], kind, "a key");
          continue;
        }
        visit(item.value, [...path, key]);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => visit(item, [...path, i]));
    } else if (isScalar(node) && typeof node.value === "string") {
      const kind = looksSecret(node.value);
      if (kind) report(node, path, kind, "the value");
    }
  };
  visit(doc.contents, []);
  return problems;
}

/** Parse and validate config text. Throws ConfigError with every problem found. */
export function parseConfig(text: string, file = "agent-qa.yaml"): Config {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length > 0) {
    throw new ConfigError(
      file,
      doc.errors.map((e) => ({ path: "$", message: e.message.split("\n")[0] ?? e.message, line: counter.linePos(e.pos[0]).line })),
    );
  }

  const problems = scanLiteralSecrets(doc, counter);
  // A file that leaks a secret is rejected before anything else, so no later message can echo it.
  if (problems.length > 0) throw new ConfigError(file, problems);

  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: 100 }) ?? {};
  } catch (error) {
    throw new ConfigError(file, [{ path: "$", message: `can't be read: ${(error as Error).message}` }]);
  }
  const parsed = configSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const line = lineOf(doc, counter, issue.path);
      // Key names are safe to show: secret-looking keys were rejected by the scan above.
      problems.push({ path: dotted(issue.path), message: issue.message, ...(line ? { line } : {}) });
    }
  }
  if (problems.length > 0 || !parsed.success) throw new ConfigError(file, problems);
  return parsed.data;
}

/** Load `agent-qa.yaml` (or `.yml`) from `dir`, or the given file. */
export async function loadConfig(dirOrFile: string, options: { isFile?: boolean } = {}): Promise<LoadedConfig> {
  const candidates = options.isFile ? [dirOrFile] : CONFIG_FILE_NAMES.map((name) => join(dirOrFile, name));
  for (const file of candidates) {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const config = parseConfig(text, file);
    const schemaVersion = SCHEMA_LINE.exec(text.replace(/^\uFEFF/, ""))?.[1];
    return { file, config, ...(schemaVersion ? { schemaVersion } : {}) };
  }
  throw new ConfigError(candidates[0] ?? dirOrFile, [
    { path: "$", message: `no config found; looked for ${candidates.join(", ")}. Run \`agent-qa init\`.` },
  ], "NOT_FOUND");
}

/** Looks up a secret in the OS keychain. T7 provides the real one. */
export type KeychainLookup = (name: string) => Promise<string | undefined>;

export interface SecretSources {
  env?: NodeJS.ProcessEnv;
  keychain?: KeychainLookup;
}

export class SecretError extends Error {
  constructor(
    readonly reference: string,
    message: string,
  ) {
    super(message);
    this.name = "SecretError";
  }
}

/**
 * Resolve a `${env:NAME}` or `${keychain:NAME}` reference at the moment it's
 * needed. Resolved values are never written back into the config object.
 */
export async function resolveSecret(reference: string, sources: SecretSources = {}): Promise<string> {
  const match = SECRET_REF.exec(reference);
  if (!match) throw new SecretError("<redacted>", "Not a secret reference (expected ${env:NAME} or ${keychain:NAME})");
  const [, kind, name] = match as unknown as [string, "env" | "keychain", string];
  if (kind === "env") {
    const value = (sources.env ?? process.env)[name];
    if (!value) throw new SecretError(reference, `Environment variable ${name} is not set`);
    return value;
  }
  // A committed config with keychain references also runs where there is no
  // keychain entry (CI, a Linux server): the variable of the same name stands in.
  const fallback = (sources.env ?? process.env)[name];
  let value: string | undefined;
  let problem: string | undefined;
  if (!sources.keychain) problem = "no keychain is available";
  else {
    try {
      value = await sources.keychain(name);
      if (!value) problem = "it isn't in the keychain";
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
  }
  if (value) return value;
  if (fallback) return fallback;
  throw new SecretError(reference, `Keychain entry ${name} not found (${problem}), and no environment variable ${name} is set. Store it with: agent-qa secret set ${name}`);
}

/** JSON Schema for editors (VS Code YAML extension) and docs. */
export function configJsonSchema(): unknown {
  return z.toJSONSchema(configSchema, { io: "input", target: "draft-7" });
}
