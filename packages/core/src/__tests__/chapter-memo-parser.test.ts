import { describe, it, expect } from "vitest";
import { parseMemo, PlannerParseError } from "../utils/chapter-memo-parser.js";

const SECTIONS = `
## 当前任务
主角进入七号门查看被动过手脚的痕迹。

## 读者此刻在等什么
1) 读者在等七号门异常是否实锤
2) 本章完全兑现——钉成现场实证

## 该兑现的 / 暂不掀的
- 该兑现：七号门异常 → 钉成现场实证
- 暂不掀：幕后主使 → 压到第 20 章

## 日常/过渡承担什么任务
不适用 - 本章无日常过渡

## 关键抉择过三连问
- 主角本章最关键的一次选择：
  - 为什么这么做？因为线索只剩这一条
  - 符合当前利益吗？符合
  - 符合他的人设吗？符合
- 对手/配角本章最关键的一次选择：
  - 为什么这么做？为了掩盖踪迹
  - 符合当前利益吗？符合
  - 符合他的人设吗？符合

## 章尾必须发生的改变
- 信息改变：主角掌握实证
- 关系改变：主角对阿泽产生戒心

## 不要做
- 不要让对手突然降智
- 不要直接点破幕后主使
`.trim();

function makeRaw(
  opts: {
    chapter?: number | string;
    goal?: string;
    isGoldenOpening?: boolean | string;
    threadRefs?: ReadonlyArray<string> | null | unknown;
    body?: string;
    dropFrontmatter?: boolean;
  } = {},
): string {
  if (opts.dropFrontmatter) {
    return opts.body ?? SECTIONS;
  }

  const threadRefsText = Array.isArray(opts.threadRefs)
    ? `threadRefs:\n${opts.threadRefs.map((id) => `  - ${id}`).join("\n")}`
    : opts.threadRefs === null
      ? "threadRefs: null"
      : opts.threadRefs === undefined
        ? "threadRefs: []"
        : `threadRefs: ${String(opts.threadRefs)}`;

  const frontmatter = [
    `chapter: ${opts.chapter ?? 12}`,
    `goal: ${opts.goal ?? "把七号门被动过手脚钉成现场实证"}`,
    `isGoldenOpening: ${opts.isGoldenOpening ?? false}`,
    threadRefsText,
  ].join("\n");

  return `---\n${frontmatter}\n---\n${opts.body ?? SECTIONS}\n`;
}

describe("parseMemo", () => {
  it("parses a valid frontmatter + 7 sections", () => {
    const memo = parseMemo(makeRaw({ threadRefs: ["H03", "S004"] }), 12, false);
    expect(memo.chapter).toBe(12);
    expect(memo.goal).toBe("把七号门被动过手脚钉成现场实证");
    expect(memo.isGoldenOpening).toBe(false);
    expect(memo.threadRefs).toEqual(["H03", "S004"]);
    expect(memo.body).toContain("## 当前任务");
    expect(memo.body).toContain("## 不要做");
  });

  it("throws when frontmatter delimiters are missing", () => {
    expect(() => parseMemo(SECTIONS, 12, false)).toThrow(PlannerParseError);
    expect(() => parseMemo(SECTIONS, 12, false)).toThrow(/frontmatter/);
  });

  it("throws when goal exceeds 50 chars", () => {
    const longGoal = "把异常钉成实证".repeat(10);
    expect(() => parseMemo(makeRaw({ goal: longGoal }), 12, false)).toThrow(/goal too long/);
  });

  it("throws when chapter mismatches expected", () => {
    expect(() => parseMemo(makeRaw({ chapter: 99 }), 12, false)).toThrow(/chapter mismatch/);
  });

  it.each([
    "## 当前任务",
    "## 读者此刻在等什么",
    "## 该兑现的 / 暂不掀的",
    "## 日常/过渡承担什么任务",
    "## 关键抉择过三连问",
    "## 章尾必须发生的改变",
    "## 不要做",
  ])("throws when body is missing section %s", (heading) => {
    const body = SECTIONS.replace(heading, "## SECTION-REMOVED");
    expect(() => parseMemo(makeRaw({ body }), 12, false)).toThrow(/missing sections/);
  });

  it("silently coerces non-array threadRefs to empty array", () => {
    const raw = makeRaw({ threadRefs: null });
    const memo = parseMemo(raw, 12, false);
    expect(memo.threadRefs).toEqual([]);
  });

  it("uses caller-provided isGoldenOpening, not LLM frontmatter value", () => {
    // LLM claims true but caller says false — caller wins
    const raw = makeRaw({ isGoldenOpening: true });
    const memo = parseMemo(raw, 12, false);
    expect(memo.isGoldenOpening).toBe(false);

    // LLM claims false but caller says true — caller wins
    const raw2 = makeRaw({ isGoldenOpening: false });
    const memo2 = parseMemo(raw2, 12, true);
    expect(memo2.isGoldenOpening).toBe(true);
  });

  it("throws when YAML frontmatter is not an object", () => {
    const raw = `---\n- just\n- a\n- list\n---\n${SECTIONS}\n`;
    expect(() => parseMemo(raw, 12, false)).toThrow(/frontmatter is not an object/);
  });

  it("throws when chapter is not an integer", () => {
    const raw = `---\nchapter: 12.5\ngoal: x\nisGoldenOpening: false\nthreadRefs: []\n---\n${SECTIONS}\n`;
    expect(() => parseMemo(raw, 12, false)).toThrow(/chapter must be an integer/);
  });

  it("throws on invalid YAML", () => {
    const raw = `---\nchapter: 12\n  bad indent: : :\n---\n${SECTIONS}\n`;
    expect(() => parseMemo(raw, 12, false)).toThrow(/invalid YAML/);
  });
});
