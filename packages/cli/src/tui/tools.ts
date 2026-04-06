import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PipelineRunner, StateManager, type ReviseMode } from "@actalk/inkos-core";
import type { InteractionRuntimeTools } from "@actalk/inkos-core";
import { buildPipelineConfig, createClient, loadConfig } from "../utils.js";

type PipelineLike = Pick<PipelineRunner, "writeNextChapter" | "reviseDraft">;
type StateLike = Pick<StateManager, "ensureControlDocuments" | "bookDir">;

export function createInteractionToolsFromDeps(
  _projectRoot: string,
  pipeline: PipelineLike,
  state: StateLike,
): InteractionRuntimeTools {
  return {
    writeNextChapter: (bookId) => pipeline.writeNextChapter(bookId),
    reviseDraft: (bookId, chapterNumber, mode) => pipeline.reviseDraft(bookId, chapterNumber, mode as ReviseMode),
    updateCurrentFocus: async (bookId, content) => {
      await state.ensureControlDocuments(bookId);
      await writeFile(join(state.bookDir(bookId), "story", "current_focus.md"), content, "utf-8");
    },
    updateAuthorIntent: async (bookId, content) => {
      await state.ensureControlDocuments(bookId);
      await writeFile(join(state.bookDir(bookId), "story", "author_intent.md"), content, "utf-8");
    },
  };
}

export async function createInteractionTools(projectRoot: string): Promise<InteractionRuntimeTools> {
  const config = await loadConfig();
  const pipeline = new PipelineRunner(buildPipelineConfig(config, projectRoot));
  const state = new StateManager(projectRoot);
  return createInteractionToolsFromDeps(projectRoot, pipeline, state);
}
