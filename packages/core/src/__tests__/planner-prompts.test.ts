import { describe, it, expect } from "vitest";
import {
  PLANNER_MEMO_SYSTEM_PROMPT,
  PLANNER_MEMO_USER_TEMPLATE,
  buildPlannerUserMessage,
} from "../agents/planner-prompts.js";

describe("PLANNER_MEMO_SYSTEM_PROMPT", () => {
  it("contains key methodology phrases from new.txt", () => {
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("1 主线 + 1 支线");
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("三连问");
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("YAML frontmatter");
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("goal 字段不超过 50 字");
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("## 当前任务");
    expect(PLANNER_MEMO_SYSTEM_PROMPT).toContain("## 不要做");
  });

  it("is not accidentally empty", () => {
    expect(PLANNER_MEMO_SYSTEM_PROMPT.length).toBeGreaterThan(500);
  });
});

describe("PLANNER_MEMO_USER_TEMPLATE", () => {
  it("contains all placeholders", () => {
    const placeholders = [
      "{{chapterNumber}}",
      "{{previous_chapter_ending_excerpt}}",
      "{{recent_summaries}}",
      "{{current_arc_prose}}",
      "{{protagonist_matrix_row}}",
      "{{opponent_rows}}",
      "{{collaborator_rows}}",
      "{{relevant_threads}}",
      "{{isGoldenOpening}}",
      "{{book_rules_relevant}}",
    ];
    for (const ph of placeholders) {
      expect(PLANNER_MEMO_USER_TEMPLATE).toContain(ph);
    }
  });
});

describe("buildPlannerUserMessage", () => {
  it("fills placeholders in order", () => {
    const out = buildPlannerUserMessage({
      chapterNumber: 12,
      previousChapterEndingExcerpt: "上一屏结尾原文",
      recentSummaries: "| ch9 | ... |",
      currentArcProse: "主线推进七号门",
      protagonistMatrixRow: "| 阿泽 | 主角 | ... |",
      opponentRows: "| 老李 | 对手 | ... |",
      collaboratorRows: "| 小白 | 盟友 | ... |",
      relevantThreads: "- H03: 未解码信\n- S004: 七号门异常",
      isGoldenOpening: false,
      bookRulesRelevant: "- 禁止主角降智",
    });

    expect(out).toContain("# 第 12 章 memo 请求");
    expect(out).toContain("上一屏结尾原文");
    expect(out).toContain("| ch9 | ... |");
    expect(out).toContain("主线推进七号门");
    expect(out).toContain("| 阿泽 | 主角 | ... |");
    expect(out).toContain("| 老李 | 对手 | ... |");
    expect(out).toContain("| 小白 | 盟友 | ... |");
    expect(out).toContain("- H03: 未解码信");
    expect(out).toContain("是否黄金三章：否");
    expect(out).toContain("- 禁止主角降智");
    expect(out).not.toContain("{{");
  });

  it("translates isGoldenOpening true to 是", () => {
    const out = buildPlannerUserMessage({
      chapterNumber: 1,
      previousChapterEndingExcerpt: "",
      recentSummaries: "",
      currentArcProse: "",
      protagonistMatrixRow: "",
      opponentRows: "",
      collaboratorRows: "",
      relevantThreads: "",
      isGoldenOpening: true,
      bookRulesRelevant: "",
    });
    expect(out).toContain("是否黄金三章：是");
  });
});
