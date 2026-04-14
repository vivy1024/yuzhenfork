import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlannerAgent } from "../agents/planner.js";
import * as llmProvider from "../llm/provider.js";
import type { LLMClient } from "../llm/provider.js";
import type { BookConfig } from "../models/book.js";
import { PlannerParseError } from "../utils/chapter-memo-parser.js";

const VALID_BODY = `
## 当前任务
主角进入七号门查看被动过手脚的痕迹。

## 读者此刻在等什么
1) 读者在等七号门是否有异常
2) 本章完全兑现

## 该兑现的 / 暂不掀的
- 该兑现：七号门异常 → 钉成现场实证
- 暂不掀：幕后主使 → 压到第 20 章

## 日常/过渡承担什么任务
不适用 - 本章无日常过渡

## 关键抉择过三连问
- 主角本章最关键的一次选择：
  - 为什么这么做？线索只剩这一条
  - 符合当前利益吗？符合
  - 符合他的人设吗？符合
- 对手/配角本章最关键的一次选择：
  - 为什么这么做？掩盖踪迹
  - 符合当前利益吗？符合
  - 符合他的人设吗？符合

## 章尾必须发生的改变
- 信息改变：主角掌握实证

## 不要做
- 不要让对手突然降智
- 不要直接点破幕后主使
`.trim();

function validMemoRaw(chapter: number): string {
  return `---\nchapter: ${chapter}\ngoal: 把七号门被动过手脚钉成现场实证\nisGoldenOpening: false\nthreadRefs:\n  - H03\n  - S004\n---\n${VALID_BODY}\n`;
}

const ZERO_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
} as const;

const STUB_CLIENT: LLMClient = {
  provider: "openai",
  apiFormat: "chat",
  stream: false,
  _openai: {} as never,
  defaults: { temperature: 0.7, maxTokens: 2048, thinkingBudget: 0, maxTokensCap: null, extra: {} },
};

function makeBook(): BookConfig {
  return {
    id: "book-plan-1",
    title: "Test Book",
    genre: "urban",
    platform: "qidian",
    status: "active",
    language: "zh",
    targetChapters: 120,
    chapterWordCount: 3000,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

async function seedStoryFiles(bookDir: string): Promise<void> {
  const storyDir = join(bookDir, "story");
  await mkdir(storyDir, { recursive: true });
  await Promise.all([
    writeFile(join(storyDir, "author_intent.md"), "# Intent\n- Tell a taut mystery.", "utf-8"),
    writeFile(join(storyDir, "current_focus.md"), "# Focus\n- Keep pressure on the seventh gate.", "utf-8"),
    writeFile(join(storyDir, "story_bible.md"), "# Bible\n- Protagonist: 阿泽", "utf-8"),
    writeFile(join(storyDir, "volume_outline.md"), "# Outline\n- 第 1 章：开场", "utf-8"),
    writeFile(join(storyDir, "chapter_summaries.md"), "# Summaries\n", "utf-8"),
    writeFile(join(storyDir, "book_rules.md"), "# Rules\n- 禁止反派降智", "utf-8"),
    writeFile(join(storyDir, "current_state.md"), "# State\n- 主角在七号门附近", "utf-8"),
    writeFile(join(storyDir, "pending_hooks.md"), "# Hooks\n", "utf-8"),
    writeFile(join(storyDir, "subplot_board.md"), "# Subplot\n", "utf-8"),
    writeFile(join(storyDir, "emotional_arcs.md"), "# Arcs\n", "utf-8"),
    writeFile(join(storyDir, "character_matrix.md"), "# Matrix\n", "utf-8"),
  ]);
}

describe("PlannerAgent.planChapter memo generation", () => {
  let root: string;
  let bookDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "planner-memo-"));
    bookDir = join(root, "book");
    await seedStoryFiles(bookDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  function makePlanner(): PlannerAgent {
    return new PlannerAgent({
      client: STUB_CLIENT,
      model: "test-model",
      projectRoot: root,
      bookId: "book-plan-1",
    });
  }

  it("produces a valid ChapterMemo when the LLM returns well-formed output", async () => {
    const chatSpy = vi.spyOn(llmProvider, "chatCompletion").mockResolvedValue({
      content: validMemoRaw(1),
      usage: ZERO_USAGE,
    } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    const result = await makePlanner().planChapter({
      book: makeBook(),
      bookDir,
      chapterNumber: 1,
    });

    expect(chatSpy).toHaveBeenCalledTimes(1);
    expect(result.memo.chapter).toBe(1);
    expect(result.memo.isGoldenOpening).toBe(true); // ch1 zh → golden opening, authoritative over LLM
    expect(result.memo.goal).toBe("把七号门被动过手脚钉成现场实证");
    expect(result.memo.threadRefs).toEqual(["H03", "S004"]);
    expect(result.memo.body).toContain("## 当前任务");
  });

  it("retries when the first response is malformed and succeeds on retry", async () => {
    const chatSpy = vi.spyOn(llmProvider, "chatCompletion")
      .mockResolvedValueOnce({
        content: "no frontmatter here",
        usage: ZERO_USAGE,
      } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>)
      .mockResolvedValueOnce({
        content: "still no frontmatter",
        usage: ZERO_USAGE,
      } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>)
      .mockResolvedValueOnce({
        content: validMemoRaw(4),
        usage: ZERO_USAGE,
      } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    const result = await makePlanner().planChapter({
      book: makeBook(),
      bookDir,
      chapterNumber: 4,
    });

    expect(chatSpy).toHaveBeenCalledTimes(3);
    expect(result.memo.chapter).toBe(4);
    expect(result.memo.isGoldenOpening).toBe(false);

    // Retry prompts must include the failure feedback
    const secondCallArgs = chatSpy.mock.calls[1]!;
    const secondMessages = secondCallArgs[2] as ReadonlyArray<{ role: string; content: string }>;
    const userMsg = secondMessages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("上次输出的错误");
  });

  it("throws PlannerParseError when all 3 attempts fail", async () => {
    vi.spyOn(llmProvider, "chatCompletion").mockResolvedValue({
      content: "permanently broken",
      usage: ZERO_USAGE,
    } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    await expect(
      makePlanner().planChapter({
        book: makeBook(),
        bookDir,
        chapterNumber: 2,
      }),
    ).rejects.toBeInstanceOf(PlannerParseError);
  });
});
