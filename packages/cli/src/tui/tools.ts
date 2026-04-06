import {
  PipelineRunner,
  StateManager,
  createInteractionToolsFromDeps,
  type InteractionRuntimeTools,
} from "@actalk/inkos-core";
import { buildPipelineConfig, loadConfig } from "../utils.js";

type CliPipelineLike = Pick<PipelineRunner, "writeNextChapter" | "reviseDraft">;
type CliStateLike = Pick<StateManager, "ensureControlDocuments" | "bookDir" | "loadChapterIndex" | "saveChapterIndex">;

export function createCliInteractionToolsFromDeps(
  pipeline: CliPipelineLike,
  state: CliStateLike,
): InteractionRuntimeTools {
  return createInteractionToolsFromDeps(pipeline, state);
}

// Backward-compatible export for the current CLI tests during the extraction phase.
export function createInteractionToolsFromDepsCompat(
  _projectRoot: string,
  pipeline: CliPipelineLike,
  state: CliStateLike,
): InteractionRuntimeTools {
  return createInteractionToolsFromDeps(pipeline, state);
}

export { createInteractionToolsFromDepsCompat as createInteractionToolsFromDeps };

export async function createInteractionTools(projectRoot: string): Promise<InteractionRuntimeTools> {
  const config = await loadConfig();
  const pipeline = new PipelineRunner(buildPipelineConfig(config, projectRoot));
  const state = new StateManager(projectRoot);
  return createInteractionToolsFromDeps(pipeline, state);
}
