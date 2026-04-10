import { describe, expect, it } from "vitest";
import {
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
} from "../agents/planner-prompts.js";
import type { PlanningMaterials } from "../utils/planning-materials.js";

const MATERIALS: PlanningMaterials = {
  storyDir: "/tmp/project/books/harbor/story",
  authorIntent: "# Author Intent\n\nKeep the mentor debt line central.\n",
  currentFocus: "# Current Focus\n\nReturn to the warehouse confrontation.\n",
  storyBible: "# Story Bible\n\n- The jade seal cannot be destroyed.\n",
  volumeOutline: "# Volume Outline\n\n## Chapter 4\nForce the warehouse confrontation.\n",
  bookRulesRaw: "---\nprohibitions:\n  - Do not reveal the mastermind\n---",
  currentState: "# Current State\n\n- Lin Yue is still injured.\n",
  chapterSummariesRaw: "# Chapter Summaries",
  outlineNode: "Force the warehouse confrontation.",
  recentSummaries: [
    {
      chapter: 3,
      title: "Canal Shadow",
      characters: "Lin Yue,A Sheng",
      events: "Ledger route points to the warehouse.",
      stateChanges: "Harbor pressure rises.",
      hookActivity: "The unsigned transfer sheet becomes urgent.",
      mood: "tight",
      chapterType: "pursuit",
    },
  ],
  activeHooks: [
    {
      hookId: "H019",
      startChapter: 2,
      type: "mentor-debt",
      status: "active",
      lastAdvancedChapter: 3,
      expectedPayoff: "Debt becomes immediate cost",
      payoffTiming: "mid-arc",
      notes: "Pressure should move on-page soon.",
    },
  ],
  previousEndingHook: "The unsigned transfer sheet becomes urgent.",
  memorySelection: {
    summaries: [],
    hooks: [],
    activeHooks: [],
    facts: [],
    volumeSummaries: [],
  },
  plannerInputs: [],
};

describe("planner prompt builders", () => {
  it("forbids meta-language leakage in the system prompt", () => {
    const prompt = buildPlannerSystemPrompt("zh");

    expect(prompt).toContain("ChapterBrief");
    expect(prompt).toContain("第一章");
    expect(prompt).toContain("小爽点");
  });

  it("builds a chronicle-driven user prompt without mustKeep", () => {
    const prompt = buildPlannerUserPrompt({
      chapterNumber: 4,
      targetChapters: 20,
      genreName: "xuanhuan",
      language: "zh",
      materials: MATERIALS,
    });

    expect(prompt).toContain("## Previous Ending Hook");
    expect(prompt).toContain("unsigned transfer sheet");
    expect(prompt).toContain("## Recent Chronicle");
    expect(prompt).toContain("## Active Hooks");
    expect(prompt).not.toContain("mustKeep");
    expect(prompt).not.toContain("本章必须");
  });
});
