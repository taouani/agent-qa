import { createHash } from "node:crypto";
import { z } from "zod";
import type { ArtifactSpec, RunStore, WorkflowDefinition } from "../../core/index.js";
import {
  describeProfile,
  FRAMEWORK_PROFILE_ARTIFACT,
  FRAMEWORK_PROFILE_TEMPLATE_VERSION,
  frameworkProfileSchema,
  PROFILE_FILE,
  type FrameworkProfile,
  type ProfileData,
} from "../../data/index.js";

/**
 * The `profile` workflow (S2-2). No model writes anything here:
 *
 * 1. The core scans the repo's Playwright project (nothing in it runs) and
 *    shows the person what it found and which commands Agent-QA would run.
 * 2. Review, a confirm step whose yes comes from the person: it decides what
 *    may run in their repo. On yes, agent-qa.profile.json is saved through
 *    the policy layer (testCode). Either way the full scan is kept in the run
 *    folder as framework-profile@1.
 */

export interface ProfileDeps {
  data: ProfileData;
  runs: Pick<RunStore, "writeArtifact">;
}

export const profileInputSchema = z
  .object({
    folder: z.string().trim().min(1).max(300).optional().describe("The Playwright project's folder, relative to the project root. Default: found automatically"),
  })
  .strict();
export type ProfileInputs = z.infer<typeof profileInputSchema>;

const reviewSchema = z.object({ approve: z.boolean().describe("true only if the user accepted the profile and its commands") }).strict();

export const FRAMEWORK_PROFILE_SPEC: ArtifactSpec<FrameworkProfile> = {
  name: FRAMEWORK_PROFILE_ARTIFACT.name,
  schema: `${FRAMEWORK_PROFILE_ARTIFACT.name}@${FRAMEWORK_PROFILE_ARTIFACT.version}`,
  data: frameworkProfileSchema,
  render: (p) => `# Framework profile\n\n${describeProfile(p)}\n`,
};

export function profileWorkflow(deps: ProfileDeps): WorkflowDefinition<ProfileInputs> {
  const scan = ({ runId, inputs }: { runId: string; inputs: ProfileInputs }) => deps.data.frameworkProfile(runId, inputs.folder);
  return {
    id: "profile",
    description: `Read the repo's Playwright project (config, steps, page objects, fixtures, locators) and, once the user accepts, save ${PROFILE_FILE}: the folder and the only commands Agent-QA may run there.`,
    inputSchema: profileInputSchema,
    steps: [
      {
        id: "review",
        kind: "confirm",
        outputSchema: reviewSchema,
        // Never unattended: this decides what runs in the repo.
        answers: { yes: { approve: true }, no: { approve: false }, unattended: { approve: false } },
        approval: {
          question: async (ctx) => {
            const p = await scan(ctx);
            if (p.kind === "empty") return `There is no Playwright project in ${p.folder}. Close this run?`;
            const commands = [p.commands!.generate, p.commands!.test, p.commands!.typecheck].filter(Boolean).map((c) => c!.join(" "));
            return `Save ${PROFILE_FILE} for ${p.kind} in ${p.folder}? Agent-QA may then run only: ${commands.join("; ")}.`;
          },
        },
        instructions: () =>
          [
            `Show the user the framework profile in the context and ask whether to accept it. Accepting saves ${PROFILE_FILE} in their project: the folder and the commands Agent-QA may run there. Wait for their answer.`,
            "Submit approve: true only if they said yes. approve: false saves nothing.",
          ].join("\n"),
        context: async (ctx) => describeProfile(await scan(ctx)),
        onAccept: async (ctx, output) => {
          const p = await scan(ctx);
          const hash = createHash("sha256").update(JSON.stringify(p)).digest("hex");
          await deps.runs.writeArtifact(ctx.runId, FRAMEWORK_PROFILE_SPEC, p, {
            inputs: [{ kind: "repo-folder", ref: p.folder, hash }],
            templateVersion: FRAMEWORK_PROFILE_TEMPLATE_VERSION,
          });
          if (output.approve && p.kind !== "empty") await deps.data.saveProfile(ctx.runId, ctx.inputs.folder, p.commands);
        },
      },
    ],
  };
}
