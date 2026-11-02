import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "../engine/stores.js";
import type { RunState, StateStore } from "../engine/types.js";
import { VERSION } from "../version.js";

/**
 * Contract 2: the run folder. Each run lives in
 * `.agent-qa/runs/{UTC date}-{context}-{4-char id}/` with `run.json`, typed
 * artifacts, `steps/` (engine state, so a run can resume) and `log.jsonl`.
 */

export const RUN_SCHEMA_VERSION = 1;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ARTIFACT_NAME = /^[a-z][a-z0-9-]*$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const HEX64 = /^[0-9a-f]{64}$/;

function checkId(runId: string): string {
  if (!SAFE_ID.test(runId) || runId.includes("..")) throw new RunStoreError(`Unsafe run id: ${runId}`);
  return runId;
}

export class RunStoreError extends Error {
  constructor(
    message: string,
    readonly errors: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "RunStoreError";
  }
}

/** `PROJ-123`, `Login page!` → `Login-page`. Safe in a folder name on every OS; `run` when nothing is left. */
export function contextSlug(context: string): string {
  const slug = context
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
  return slug || "run";
}

/** `{UTC date}-{context}-{4-char id}`, e.g. `2026-11-20-PROJ-123-k3f9`. */
export function newRunId(context: string, now: Date = new Date(), random: (n: number) => Buffer = randomBytes): string {
  const suffix = [...random(4)].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
  return `${now.toISOString().slice(0, 10)}-${contextSlug(context)}-${suffix}`;
}

/** The context part of a run id: the ticket or page a run is about, else the workflow id. */
export function contextOf(workflowId: string, inputs: unknown): string {
  if (inputs && typeof inputs === "object") {
    for (const key of ["ticket", "issue", "key", "page", "context"]) {
      const value = (inputs as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return workflowId;
}

export const inputRefSchema = z
  .object({
    kind: z.enum(["jira-issue", "confluence-page", "artifact", "git-diff"]),
    ref: z.string().min(1),
    /** sha256 (hex) of the masked input. */
    hash: z.string().regex(HEX64, "must be a sha256 hex digest"),
  })
  .strict();
export type InputRef = z.infer<typeof inputRefSchema>;

export const RUN_STATUSES = ["running", "needs-input", "done", "failed", "cancelled"] as const;
export type RunManifestStatus = (typeof RUN_STATUSES)[number];

export const runManifestSchema = z
  .object({
    id: z.string().regex(SAFE_ID),
    workflow: z.string().min(1),
    context: z.string().min(1),
    status: z.enum(RUN_STATUSES),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().optional(),
    host: z.enum(["copilot", "claude-code", "cursor", "cli", "other"]),
    driver: z.enum(["host-model", "api", "headless"]),
    model: z.string().min(1).optional(),
    versions: z.object({ package: z.string(), runSchema: z.literal(RUN_SCHEMA_VERSION) }).strict(),
    inputs: z.array(inputRefSchema),
    artifacts: z.array(
      z.object({ name: z.string().regex(ARTIFACT_NAME), schema: z.string(), sourceHash: z.string().regex(HEX64), file: z.string() }).strict(),
    ),
    /** Earlier runs whose output this run reused. */
    parentRuns: z.array(z.string()),
  })
  .strict();
export type RunManifest = z.infer<typeof runManifestSchema>;

export interface RunInit {
  workflow: string;
  context: string;
  host: RunManifest["host"];
  driver: RunManifest["driver"];
  model?: string;
  inputs?: InputRef[];
  parentRuns?: string[];
  /** Use this id instead of generating one. Fails if the folder exists. */
  id?: string;
}

/** An artifact type: its schema name (`name@major`) and data schema, plus an optional markdown view. */
export interface ArtifactSpec<T> {
  /** File name without extension, e.g. `test-cases`. */
  name: string;
  /** `test-cases@1`. */
  schema: string;
  data: z.ZodType<T>;
  render?: (data: T) => string;
}

export interface Artifact<T> {
  schema: string;
  runId: string;
  createdAt: string;
  sourceHash: string;
  inputs: InputRef[];
  /** Artifacts only ever hold tokens, never real values. */
  masked: true;
  data: T;
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** sha256 of a masked input's text, for `InputRef.hash`. */
export function hashInput(maskedText: string): string {
  return sha256(maskedText);
}

/**
 * Hash of the masked inputs, the prompt template version and the schema
 * version. Input order doesn't matter. Same hash means the output is up to date.
 */
export function sourceHash(parts: { inputs: InputRef[]; templateVersion: string; schema: string }): string {
  const inputs = parts.inputs
    .map((i) => [i.kind, i.ref, i.hash])
    .sort((a, b) => (a.join("\u0000") < b.join("\u0000") ? -1 : a.join("\u0000") > b.join("\u0000") ? 1 : 0));
  return sha256(JSON.stringify({ schema: parts.schema, template: parts.templateVersion, inputs }));
}

const envelopeSchema = z
  .object({
    schema: z.string().regex(/^[a-z][a-z0-9-]*@\d+$/, "must be name@major"),
    runId: z.string(),
    createdAt: z.iso.datetime(),
    sourceHash: z.string().regex(HEX64),
    inputs: z.array(inputRefSchema),
    masked: z.literal(true),
    data: z.unknown(),
  })
  .strict();

function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: ["$", ...i.path.map(String)].join("."), message: i.message }));
}

const TERMINAL: ReadonlySet<RunManifestStatus> = new Set(["done", "failed", "cancelled"]);

export interface RunStoreOptions {
  now?: () => Date;
  random?: (n: number) => Buffer;
}

/** Run folders under `root` (normally `{project}/.agent-qa/runs`). One process per root. */
export class RunStore {
  private readonly now: () => Date;
  private readonly random: (n: number) => Buffer;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    readonly root: string,
    options: RunStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? randomBytes;
  }

  dir(runId: string): string {
    return join(this.root, checkId(runId));
  }

  /** A fresh run id for the engine (`EngineOptions.newRunId`). */
  readonly newRunId = (workflowId: string, inputs: unknown): string =>
    newRunId(contextOf(workflowId, inputs), this.now(), this.random);

  /** Serialise read-modify-write of one run's files. */
  private locked<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(runId) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    const settled = next.catch(() => undefined);
    this.locks.set(runId, settled);
    void settled.then(() => {
      if (this.locks.get(runId) === settled) this.locks.delete(runId);
    });
    return next;
  }

  /** Create a run folder and its `run.json`. */
  async create(init: RunInit): Promise<RunManifest> {
    await mkdir(this.root, { recursive: true });
    for (let attempt = 0; ; attempt++) {
      const id = init.id ?? newRunId(init.context, this.now(), this.random);
      try {
        await mkdir(this.dir(id));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST" && !init.id && attempt < 5) continue;
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RunStoreError(`Run folder already exists: ${id}`);
        throw error;
      }
      const manifest: RunManifest = {
        id,
        workflow: init.workflow,
        context: init.context,
        status: "running",
        startedAt: this.now().toISOString(),
        host: init.host,
        driver: init.driver,
        ...(init.model ? { model: init.model } : {}),
        versions: { package: VERSION, runSchema: RUN_SCHEMA_VERSION },
        inputs: init.inputs ?? [],
        artifacts: [],
        parentRuns: init.parentRuns ?? [],
      };
      await this.writeManifest(manifest);
      return manifest;
    }
  }

  private async writeManifest(manifest: RunManifest): Promise<void> {
    const parsed = runManifestSchema.safeParse(manifest);
    if (!parsed.success) throw new RunStoreError(`Invalid run.json for ${manifest.id}`, issues(parsed.error));
    await writeFileAtomic(join(this.dir(manifest.id), "run.json"), JSON.stringify(parsed.data, null, 2) + "\n");
  }

  private async readJson(file: string): Promise<unknown> {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new RunStoreError(`${file} is not valid JSON`);
    }
  }

  async manifest(runId: string): Promise<RunManifest | undefined> {
    const raw = await this.readJson(join(this.dir(runId), "run.json"));
    if (raw === undefined) return undefined;
    const parsed = runManifestSchema.safeParse(raw);
    if (!parsed.success) throw new RunStoreError(`Invalid run.json for ${runId}`, issues(parsed.error));
    return parsed.data;
  }

  /** Change a run's status (setting `endedAt` when it finishes), model, inputs or parent runs. */
  async update(
    runId: string,
    patch: Partial<Pick<RunManifest, "status" | "model" | "inputs" | "parentRuns">>,
  ): Promise<RunManifest> {
    return this.locked(runId, async () => {
      const current = await this.manifest(runId);
      if (!current) throw new RunStoreError(`Run not found: ${runId}`);
      const next: RunManifest = { ...current, ...patch };
      if (patch.status && TERMINAL.has(patch.status) && !current.endedAt) next.endedAt = this.now().toISOString();
      if (patch.status && !TERMINAL.has(patch.status)) delete next.endedAt;
      await this.writeManifest(next);
      return next;
    });
  }

  /**
   * Validate `data` against the spec and write `{name}.json` (and `{name}.md`
   * when the spec renders). Invalid data is never written. Records the artifact
   * and its inputs in `run.json`.
   */
  async writeArtifact<T>(
    runId: string,
    spec: ArtifactSpec<T>,
    data: unknown,
    source: { inputs: InputRef[]; templateVersion: string },
  ): Promise<Artifact<T>> {
    if (!ARTIFACT_NAME.test(spec.name) || spec.name === "run" || spec.name === "log") {
      throw new RunStoreError(`Invalid artifact name: ${spec.name}`);
    }
    const parsed = spec.data.safeParse(data);
    if (!parsed.success) throw new RunStoreError(`Invalid ${spec.schema} artifact`, issues(parsed.error));
    const inputs = z.array(inputRefSchema).safeParse(source.inputs);
    if (!inputs.success) throw new RunStoreError(`Invalid inputs for ${spec.schema}`, issues(inputs.error));

    return this.locked(runId, async () => {
      const manifest = await this.manifest(runId);
      if (!manifest) throw new RunStoreError(`Run not found: ${runId}`);
      const artifact: Artifact<T> = {
        schema: spec.schema,
        runId,
        createdAt: this.now().toISOString(),
        sourceHash: sourceHash({ inputs: inputs.data, templateVersion: source.templateVersion, schema: spec.schema }),
        inputs: inputs.data,
        masked: true,
        data: parsed.data,
      };
      const envelope = envelopeSchema.safeParse(artifact);
      if (!envelope.success) throw new RunStoreError(`Invalid ${spec.schema} envelope`, issues(envelope.error));
      const file = `${spec.name}.json`;
      await writeFileAtomic(join(this.dir(runId), file), JSON.stringify(artifact, null, 2) + "\n");
      if (spec.render) await writeFileAtomic(join(this.dir(runId), `${spec.name}.md`), spec.render(parsed.data));

      const seen = new Set(manifest.inputs.map((i) => `${i.kind}\u0000${i.ref}\u0000${i.hash}`));
      const mergedInputs = [...manifest.inputs, ...inputs.data.filter((i) => !seen.has(`${i.kind}\u0000${i.ref}\u0000${i.hash}`))];
      const entry = { name: spec.name, schema: spec.schema, sourceHash: artifact.sourceHash, file };
      await this.writeManifest({
        ...manifest,
        inputs: mergedInputs,
        artifacts: [...manifest.artifacts.filter((a) => a.name !== spec.name), entry],
      });
      return artifact;
    });
  }

  /** Read and validate an artifact. Undefined when the run has none by that name. */
  async readArtifact<T>(runId: string, spec: ArtifactSpec<T>): Promise<Artifact<T> | undefined> {
    const raw = await this.readJson(join(this.dir(runId), `${spec.name}.json`));
    if (raw === undefined) return undefined;
    const envelope = envelopeSchema.safeParse(raw);
    if (!envelope.success) throw new RunStoreError(`Invalid ${spec.name} artifact in ${runId}`, issues(envelope.error));
    if (envelope.data.schema !== spec.schema) {
      throw new RunStoreError(`${spec.name} in ${runId} is ${envelope.data.schema}, expected ${spec.schema}`);
    }
    if (envelope.data.runId !== runId) throw new RunStoreError(`${spec.name} in ${runId} belongs to another run`);
    const data = spec.data.safeParse(envelope.data.data);
    if (!data.success) throw new RunStoreError(`Invalid ${spec.schema} data in ${runId}`, issues(data.error));
    return { ...envelope.data, masked: true, data: data.data };
  }

  /** Append one event to the run's `log.jsonl`. Events hold masked text only. */
  async log(runId: string, event: Record<string, unknown>): Promise<void> {
    await mkdir(this.dir(runId), { recursive: true });
    await appendFile(join(this.dir(runId), "log.jsonl"), JSON.stringify({ at: this.now().toISOString(), ...event }) + "\n", "utf8");
  }

  /** Run ids, oldest first (the date prefix sorts them). */
  async list(): Promise<string[]> {
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory() && SAFE_ID.test(e.name)).map((e) => e.name).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  /**
   * Engine state kept in each run's `steps/state.json`. The first save creates
   * the run folder and `run.json`; later saves keep `run.json`'s status in step.
   */
  stateStore(defaults: Pick<RunInit, "host" | "driver" | "model">): StateStore {
    const stateFile = (runId: string) => join(this.dir(runId), "steps", "state.json");
    return {
      load: async (runId) => {
        checkId(runId);
        return (await this.readJson(stateFile(runId))) as RunState | undefined;
      },
      save: async (state) => {
        const manifest = await this.manifest(state.runId);
        if (!manifest) {
          await this.create({
            ...defaults,
            id: state.runId,
            workflow: state.workflowId,
            context: contextOf(state.workflowId, state.inputs),
          });
        }
        await writeFileAtomic(stateFile(state.runId), JSON.stringify(state, null, 2) + "\n");
        if ((manifest?.status ?? "running") !== state.status) await this.update(state.runId, { status: state.status });
      },
    };
  }
}
