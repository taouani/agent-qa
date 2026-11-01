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
}

/**
 * Common token shapes. A match anywhere in the file is an error, even in a
 * field that isn't marked secret, so a pasted key never sits in git.
 */
const LITERAL_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, "GitHub token"],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, "GitLab token"],
  [/\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/, "API key"],
  [/\bxai-[A-Za-z0-9]{20,}\b/, "xAI key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bATATT[A-Za-z0-9_=-]{20,}\b/, "Atlassian API token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
];

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

function scanLiteralSecrets(doc: Document, counter: LineCounter): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const visit = (node: unknown, path: Array<string | number>) => {
    if (isMap(node)) {
      for (const item of node.items) {
        const key = isScalar(item.key) ? String(item.key.value) : String(item.key);
        visit(item.value, [...path, key]);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => visit(item, [...path, i]));
    } else if (isScalar(node) && typeof node.value === "string") {
      for (const [pattern, kind] of LITERAL_SECRET_PATTERNS) {
        if (pattern.test(node.value)) {
          const line = node.range ? counter.linePos(node.range[0]).line : undefined;
          problems.push({
            path: dotted(path),
            message: `looks like a literal ${kind}. Remove it from the file, rotate it, and use \${env:NAME} or \${keychain:NAME}`,
            ...(line ? { line } : {}),
          });
          break;
        }
      }
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
  const parsed = configSchema.safeParse(doc.toJS() ?? {});
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const line = lineOf(doc, counter, issue.path);
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
    return { file, config: parseConfig(text, file) };
  }
  throw new ConfigError(candidates[0] ?? dirOrFile, [
    { path: "$", message: `no config found; looked for ${candidates.join(", ")}. Run \`agent-qa init\`.` },
  ]);
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
  if (!match) throw new SecretError(reference, `Not a secret reference: ${reference}`);
  const [, kind, name] = match as unknown as [string, "env" | "keychain", string];
  if (kind === "env") {
    const value = (sources.env ?? process.env)[name];
    if (!value) throw new SecretError(reference, `Environment variable ${name} is not set`);
    return value;
  }
  if (!sources.keychain) throw new SecretError(reference, `No keychain available to read ${name}`);
  const value = await sources.keychain(name);
  if (!value) throw new SecretError(reference, `Keychain entry ${name} not found`);
  return value;
}

/** JSON Schema for editors (VS Code YAML extension) and docs. */
export function configJsonSchema(): unknown {
  return z.toJSONSchema(configSchema, { io: "input", target: "draft-7" });
}
