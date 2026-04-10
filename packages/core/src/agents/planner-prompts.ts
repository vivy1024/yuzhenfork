import type { PlanningMaterials } from "../utils/planning-materials.js";

export interface PlannerPromptInput {
  readonly chapterNumber: number;
  readonly targetChapters: number;
  readonly genreName: string;
  readonly language: "zh" | "en";
  readonly materials: PlanningMaterials;
}

export function buildPlannerSystemPrompt(language: "zh" | "en"): string {
  if (language === "en") {
    return [
      "You are InkOS planner.",
      "Turn planning materials into a structured ChapterBrief JSON object.",
      "Do not output prose, markdown, or explanatory notes.",
      "Do not emit meta-language such as 'Chapter 1', 'this chapter should', 'mini payoff', or planning labels that could leak into fiction.",
      "Focus on chapter-level beats, hook movement, and concrete props/setting needed for execution.",
    ].join(" ");
  }

  return [
    "你是 InkOS 的章节规划器。",
    "你的任务是把规划材料编译成结构化 ChapterBrief JSON。",
    "不要输出散文、Markdown、解释说明。",
    "禁止输出会污染正文的元语言，例如“第一章”“这一章”“小爽点”“本章必须”等。",
    "只输出章节级 beat、hook 处理和本章实际需要的地点/物件/人物。",
  ].join(" ");
}

function renderRecentSummaries(materials: PlanningMaterials): string {
  if (materials.recentSummaries.length === 0) {
    return "(none)";
  }

  return materials.recentSummaries
    .map((summary) => [
      `- Ch${summary.chapter}: ${summary.title || "(untitled)"}`,
      summary.events,
      summary.stateChanges,
      summary.hookActivity,
      summary.chapterType,
    ].filter(Boolean).join(" | "))
    .join("\n");
}

function renderActiveHooks(materials: PlanningMaterials): string {
  if (materials.activeHooks.length === 0) {
    return "(none)";
  }

  return materials.activeHooks
    .slice(0, 6)
    .map((hook) => `- ${hook.hookId} | ${hook.type} | ${hook.expectedPayoff} | last=${hook.lastAdvancedChapter} | timing=${hook.payoffTiming ?? "unspecified"}`)
    .join("\n");
}

export function buildPlannerUserPrompt(input: PlannerPromptInput): string {
  const { materials } = input;

  return [
    `## Chapter`,
    `${input.chapterNumber}/${input.targetChapters}`,
    "",
    "## Genre",
    input.genreName,
    "",
    "## Goal Seed",
    materials.outlineNode ?? "(no matched outline slice)",
    "",
    "## Author Intent",
    materials.authorIntent,
    "",
    "## Current Focus",
    materials.currentFocus,
    "",
    "## Current State",
    materials.currentState,
    "",
    "## Story Bible",
    materials.storyBible,
    "",
    "## Previous Ending Hook",
    materials.previousEndingHook ?? "(none)",
    "",
    "## Recent Chronicle",
    renderRecentSummaries(materials),
    "",
    "## Active Hooks",
    renderActiveHooks(materials),
    "",
    "## Output Requirements",
    [
      "- Return valid JSON only.",
      "- Choose one concrete chapterType.",
      "- Produce 3-5 beats in beatOutline.",
      "- Only list hooks you will actively move this chapter.",
      "- Use dormantReason to explain why other lines stay still.",
      "- propsAndSetting should only include items that must appear on-page.",
    ].join("\n"),
  ].join("\n");
}
