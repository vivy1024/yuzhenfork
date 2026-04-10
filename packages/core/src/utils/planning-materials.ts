import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StoredHook, StoredSummary } from "../state/memory-db.js";
import {
  parseChapterSummariesMarkdown,
  retrieveMemorySelection,
  type MemorySelection,
} from "./memory-retrieval.js";

export interface PlanningMaterials {
  readonly storyDir: string;
  readonly authorIntent: string;
  readonly currentFocus: string;
  readonly storyBible: string;
  readonly volumeOutline: string;
  readonly bookRulesRaw: string;
  readonly currentState: string;
  readonly chapterSummariesRaw: string;
  readonly outlineNode?: string;
  readonly recentSummaries: ReadonlyArray<StoredSummary>;
  readonly activeHooks: ReadonlyArray<StoredHook>;
  readonly previousEndingHook?: string;
  readonly memorySelection: MemorySelection;
  readonly plannerInputs: ReadonlyArray<string>;
}

async function readFileOrDefault(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "(文件尚未创建)";
  }
}

export async function gatherPlanningMaterials(params: {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly goal: string;
  readonly outlineNode?: string;
  readonly mustKeep?: ReadonlyArray<string>;
}): Promise<PlanningMaterials> {
  const storyDir = join(params.bookDir, "story");
  const sourcePaths = {
    authorIntent: join(storyDir, "author_intent.md"),
    currentFocus: join(storyDir, "current_focus.md"),
    storyBible: join(storyDir, "story_bible.md"),
    volumeOutline: join(storyDir, "volume_outline.md"),
    chapterSummaries: join(storyDir, "chapter_summaries.md"),
    bookRules: join(storyDir, "book_rules.md"),
    currentState: join(storyDir, "current_state.md"),
  } as const;

  const [
    authorIntent,
    currentFocus,
    storyBible,
    volumeOutline,
    chapterSummariesRaw,
    bookRulesRaw,
    currentState,
  ] = await Promise.all([
    readFileOrDefault(sourcePaths.authorIntent),
    readFileOrDefault(sourcePaths.currentFocus),
    readFileOrDefault(sourcePaths.storyBible),
    readFileOrDefault(sourcePaths.volumeOutline),
    readFileOrDefault(sourcePaths.chapterSummaries),
    readFileOrDefault(sourcePaths.bookRules),
    readFileOrDefault(sourcePaths.currentState),
  ]);

  const chapterSummaries = parseChapterSummariesMarkdown(chapterSummariesRaw)
    .filter((summary) => summary.chapter < params.chapterNumber)
    .sort((left, right) => right.chapter - left.chapter);
  const recentSummaries = chapterSummaries.slice(0, 4).sort((left, right) => left.chapter - right.chapter);
  const previousEndingHook = chapterSummaries[0]?.hookActivity || undefined;

  const memorySelection = await retrieveMemorySelection({
    bookDir: params.bookDir,
    chapterNumber: params.chapterNumber,
    goal: params.goal,
    outlineNode: params.outlineNode,
    mustKeep: params.mustKeep,
  });

  return {
    storyDir,
    authorIntent,
    currentFocus,
    storyBible,
    volumeOutline,
    bookRulesRaw,
    currentState,
    chapterSummariesRaw,
    outlineNode: params.outlineNode,
    recentSummaries,
    activeHooks: memorySelection.activeHooks,
    previousEndingHook,
    memorySelection,
    plannerInputs: [
      ...Object.values(sourcePaths),
      join(storyDir, "pending_hooks.md"),
      ...(memorySelection.dbPath ? [memorySelection.dbPath] : []),
    ],
  };
}
