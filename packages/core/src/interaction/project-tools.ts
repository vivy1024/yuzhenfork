import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineRunner, StateManager, ReviseMode } from "../index.js";
import type { InteractionRuntimeTools } from "./runtime.js";

type PipelineLike = Pick<PipelineRunner, "writeNextChapter" | "reviseDraft">;
type StateLike = Pick<StateManager, "ensureControlDocuments" | "bookDir">;

export function createInteractionToolsFromDeps(
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
    writeTruthFile: async (bookId, fileName, content) => {
      await state.ensureControlDocuments(bookId);
      await writeFile(join(state.bookDir(bookId), "story", fileName), content, "utf-8");
    },
  };
}
