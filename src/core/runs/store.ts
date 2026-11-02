import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { EngineError } from "../engine/engine.js";
import { writeFileAtomic } from "../engine/stores.js";
import type { RunState, StateStore } from "../engine/types.js";
import { VERSION } from "../version.js";

/**
 * Contract 2: the run folder. Each run lives in
 * `.agent-qa/runs/{UTC date}-{context}-{4-char id}/` with `run.json`, typed
 * artifacts, `steps/` (engine state, so a run can resume) and `log.jsonl`.
 */

export const RUN_SCHEMA_VERSION = 1;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const ARTIFACT_NAME = /^[a-z][a-z0-9-]{0,59}$/;
/** Names Windows reserves for devices, with or without an extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const RESERVED_ARTIFACTS = new Set(["run", "log", "steps"]);
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const HEX64 = /^[0-9a-f]{64}$/;

function checkId(runId: string): string {
  if (!SAFE_ID.test(runId) || runId.includes("..") || runId.endsWith(".") || WINDOWS_RESERVED.test(runId)) {
    throw new RunStoreError(`Unsafe run id: ${runId}`);
  }
  return runId;
}

function checkArtifact(spec: { name: string; schema: string }): void {
  if (!ARTIFACT_NAME.test(spec.name) || RESERVED_ARTIFACTS.has(spec.name) || WINDOWS_RESERVED.test(spec.name)) {
    throw new RunStoreError(`Invalid artifact name: ${spec.name}`);
  }
  if (!new RegExp(`^${spec.name}@\\d+$`).test(spec.schema)) {
    throw new RunStoreError(`Artifact ${spec.name} must have schema ${spec.name}@<major>, got ${spec.schema}`);
  }
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

const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const PAGE_ID = /^\d{1,20}$/;

/**
 * The context part of a run id: the Jira key or Confluence page id a run is
 * about, else the workflow id. Only key-shaped values are used, so free text
 * (which may hold personal data) never lands in a folder name or run.json.
 */
export function contextOf(workflowId: string, inputs: unknown): string {
  if (inputs && typeof inputs === "object") {
    const record = inputs as Record<string, unknown>;
    for (const key of ["ticket", "issue", "key"]) {
      const value = record[key];
      if (typeof value === "string" && ISSUE_KEY.test(value)) return value;
    }
    if (typeof record.page === "string" && PAGE_ID.test(record.page)) return record.page;
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
  const inputs = [...new Set(parts.inputs.map((i) => JSON.stringify([i.kind, i.ref, i.hash])))].sort();
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

/** Enough of the engine's RunState to trust a state.json before handing it back. */
const runStateShape = z
  .object({
    runId: z.string(),
    workflowId: z.string(),
    status: z.enum(["running", "done", "failed", "cancelled"]),
    stepIndex: z.number().int().min(0),
    attempt: z.number().int().min(1),
  })
  .passthrough();

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
    checkArtifact(spec);
    const parsed = spec.data.safeParse(data);
    if (!parsed.success) throw new RunStoreError(`Invalid ${spec.schema} artifact`, issues(parsed.error));
    const inputs = z.array(inputRefSchema).safeParse(source.inputs);
    if (!inputs.success) throw new RunStoreError(`Invalid inputs for ${spec.schema}`, issues(inputs.error));
    // Render before writing anything, so a failing renderer leaves no files behind.
    const markdown = spec.render ? spec.render(parsed.data) : undefined;

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
      const md = join(this.dir(runId), `${spec.name}.md`);
      if (markdown !== undefined) await writeFileAtomic(md, markdown);
      else await rm(md, { force: true }); // no stale view from an earlier version

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
    checkArtifact(spec);
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
    if (!(await this.manifest(runId))) throw new RunStoreError(`Run not found: ${runId}`);
    await appendFile(join(this.dir(runId), "log.jsonl"), JSON.stringify({ ...event, at: this.now().toISOString() }) + "\n", "utf8");
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
   * the run folder and `run.json` (an existing folder is a RUN_COLLISION); later
   * saves keep `run.json`'s status in step with the engine's.
   */
  stateStore(defaults: Pick<RunInit, "host" | "driver" | "model">): StateStore {
    const stateFile = (runId: string) => join(this.dir(runId), "steps", "state.json");
    const readState = async (runId: string): Promise<RunState | undefined> => {
      const raw = await this.readJson(stateFile(runId));
      if (raw === undefined) return undefined;
      const parsed = runStateShape.safeParse(raw);
      if (!parsed.success) throw new RunStoreError(`Invalid steps/state.json in ${runId}`, issues(parsed.error));
      if (parsed.data.runId !== runId) throw new RunStoreError(`steps/state.json in ${runId} belongs to another run`);
      return parsed.data as unknown as RunState;
    };
    const syncStatus = async (state: RunState) => {
      const manifest = await this.manifest(state.runId);
      if (!manifest) throw new RunStoreError(`run.json is missing for ${state.runId}`);
      if (manifest.workflow !== state.workflowId) {
        throw new RunStoreError(`Run ${state.runId} belongs to workflow ${manifest.workflow}, not ${state.workflowId}`);
      }
      return manifest;
    };
    return {
      load: async (runId) => {
        const state = await readState(checkId(runId));
        if (state) {
          // Repair run.json if a crash came between writing state.json and run.json.
          const manifest = await syncStatus(state);
          if (TERMINAL.has(state.status) && manifest.status !== state.status) await this.update(runId, { status: state.status });
        }
        return state;
      },
      save: async (state) => {
        const previous = await readState(state.runId);
        if (!previous) {
          try {
            await this.create({ ...defaults, id: state.runId, workflow: state.workflowId, context: contextOf(state.workflowId, state.inputs) });
          } catch (error) {
            if (error instanceof RunStoreError && /already exists/.test(error.message)) {
              throw new EngineError("RUN_COLLISION", `Run folder already exists: ${state.runId}`);
            }
            throw error;
          }
        } else {
          await syncStatus(state);
        }
        await writeFileAtomic(stateFile(state.runId), JSON.stringify(state, null, 2) + "\n");
        // Only a change in the engine's status touches run.json, so a needs-input set by a front door stays.
        if (previous && previous.status !== state.status) await this.update(state.runId, { status: state.status });
      },
    };
  }
}
