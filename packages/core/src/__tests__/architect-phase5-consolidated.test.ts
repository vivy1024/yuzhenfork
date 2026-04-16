import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArchitectAgent } from "../agents/architect.js";
import {
  readCurrentStateWithFallback,
  isCurrentStateSeedPlaceholder,
} from "../utils/outline-paths.js";
import type { BookConfig } from "../models/book.js";

// ---------------------------------------------------------------------------
// Phase 5 consolidation invariants (7 sections → 5 sections).
//
// These tests lock in the contract so future edits can't silently regress back
// to the 7-section layout that was causing gpt-5.4 to drop tail sections and
// fail book creation 30%+ of the time:
//
//   1. The architect prompt advertises exactly 5 SECTION headers.
//   2. The prompt FORBIDS duplication of protagonist-arc across story_frame
//      and roles, and forbids re-emitting rhythm_principles / current_state.
//   3. It carries explicit per-section budget markers.
//   4. current_state section is no longer REQUIRED in architect output.
//   5. book_rules prompt tells the LLM "YAML only, no prose".
//   6. Legacy 7-section outputs still parse (backward compat).
//   7. writeFoundationFiles seeds current_state.md with a marker placeholder
//      when architect produced no initial state.
//   8. readCurrentStateWithFallback derives a substitute block from
//      roles/*.Current_State + pending_hooks startChapter=0 rows when the
//      seed placeholder is still on disk.
// ---------------------------------------------------------------------------

const ZERO_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
} as const;

function buildAgent(): ArchitectAgent {
  return new ArchitectAgent({
    client: {
      provider: "openai",
      apiFormat: "chat",
      stream: false,
      defaults: {
        temperature: 0.7,
        maxTokens: 4096,
        thinkingBudget: 0,
        maxTokensCap: null,
        extra: {},
      },
    },
    model: "test-model",
    projectRoot: process.cwd(),
  });
}

function baseBook(): BookConfig {
  return {
    id: "phase5-consolidated-book",
    title: "Phase5 合并测试书",
    platform: "other",
    genre: "urban",
    status: "active",
    targetChapters: 60,
    chapterWordCount: 2200,
    language: "zh",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
  };
}

const CONSOLIDATED_RESPONSE = [
  "=== SECTION: story_frame ===",
  "## 主题与基调",
  "一段主题散文，结尾指向主角卡：本书主角是林辞，完整弧线详见 roles/主要角色/林辞.md。",
  "## 核心冲突与对手定性",
  "主角 vs 体制。对手有自己的逻辑。",
  "## 世界观底色",
  "湿冷的沿海城市，记录者与被记录者的对撞。含本书铁律：凡被记录的名字都会消失。",
  "## 终局方向",
  "最后一个镜头：码头日出。",
  "",
  "=== SECTION: volume_map ===",
  "## 各卷主题与情绪曲线",
  "三卷结构。",
  "## 关键节点章",
  "第 17 章让他回家。",
  "## 卷间钩子与回收承诺",
  "第 1 卷埋笔记本。",
  "## 角色阶段性目标",
  "卷一末：主角决定留下。",
  "## 卷尾必须发生的改变",
  "身份暴露。",
  "## 节奏原则与本书具体化",
  "1. 高潮间距：每 8-10 章一个大高潮。",
  "2. 喘息频率：3 章高压后插 1 章喘息。",
  "3. 钩子密度：每章章末 1 个主钩。",
  "4. 信息释放节奏：前 1/3 释放 30%。",
  "5. 爽点节奏：每 5 章一个智商爽点。",
  "6. 情感节点递进：每 6 章一次。",
  "",
  "=== SECTION: roles ===",
  "---ROLE---",
  "tier: major",
  "name: 林辞",
  "---CONTENT---",
  "## 核心标签",
  "沉默、执拗",
  "## 反差细节",
  "会给流浪狗留罐头",
  "## 人物小传",
  "十五岁时失去父亲。",
  "## 主角弧线（起点 → 终点 → 代价）",
  "从沉默的旁观者走向沉默的见证人——代价是离开故乡。",
  "## 当前现状",
  "第 0 章时在码头边上的旧书店做账房，最近最烦心的是账本对不上。",
  "## 关系网络",
  "与沈默是旧友。",
  "## 内在驱动",
  "想知道父亲死前那一夜发生了什么。",
  "## 成长弧光",
  "从独行到托付。",
  "---ROLE---",
  "tier: major",
  "name: 沈默",
  "---CONTENT---",
  "## 核心标签",
  "精致、疏离",
  "## 反差细节",
  "唯独对林辞从不说谎",
  "## 人物小传",
  "体制内家庭。",
  "## 当前现状",
  "新任区域办公室副职，第 0 章刚上任一周。",
  "## 关系网络",
  "与林辞复杂。",
  "## 内在驱动",
  "在规则内做到最好。",
  "## 成长弧光",
  "被迫选择。",
  "",
  "=== SECTION: book_rules ===",
  "---",
  "version: \"1.0\"",
  "protagonist:",
  "  name: 林辞",
  "  personalityLock: [沉默, 执拗]",
  "  behavioralConstraints: [不对长辈失礼]",
  "prohibitions:",
  "  - 不得美化体制暴力",
  "chapterTypesOverride: []",
  "fatigueWordsOverride: []",
  "additionalAuditDimensions: []",
  "enableFullCastTracking: false",
  "---",
  "",
  "=== SECTION: pending_hooks ===",
  "| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 上游依赖 | 回收卷 | 核心 | 半衰期 | 备注 |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  "| H01 | 1 | 主线 | 未开启 | 0 | 终章揭晓 | 终局 | 无 | 第3卷终章前 | 是 | 80 | 父亲的笔记本 |",
  "| H02 | 0 | 初始世界 | 未开启 | 0 | 首卷中段 | 近期 | 无 | 第1卷中段 | 否 | 20 | 初始状态：体制已监视码头 |",
].join("\n");

describe("Phase 5 consolidation — 7→5 sections, prompt contract", () => {
  it("the zh prompt advertises exactly 5 SECTION headers and NO rhythm_principles / current_state", async () => {
    const agent = buildAgent();
    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({ content: CONSOLIDATED_RESPONSE, usage: ZERO_USAGE });

    await agent.generateFoundation(baseBook());

    const messages = chat.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
    const system = messages[0]?.content ?? "";

    const headers = [...system.matchAll(/^=== SECTION: ([a-z_]+) ===$/gim)]
      .map((match) => match[1]);
    expect(headers).toEqual([
      "story_frame",
      "volume_map",
      "roles",
      "book_rules",
      "pending_hooks",
    ]);
  });

  it("the prompt forbids duplication across sections (dedup rule)", async () => {
    const agent = buildAgent();
    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({ content: CONSOLIDATED_RESPONSE, usage: ZERO_USAGE });

    await agent.generateFoundation(baseBook());
    const system = (chat.mock.calls[0]?.[0] as Array<{ content: string }>)[0]?.content ?? "";

    // Protagonist arc: authoritative home is roles
    expect(system).toContain("主角弧线只写在 roles");
    // World hard rules: authoritative home is story_frame.世界观底色
    expect(system).toContain("世界铁律只写在 story_frame.世界观底色");
    // Rhythm principles: authoritative home is volume_map's closing paragraph
    expect(system).toContain("节奏原则只写在 volume_map 最后一段");
  });

  it("the prompt carries explicit per-section char budget markers", async () => {
    const agent = buildAgent();
    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({ content: CONSOLIDATED_RESPONSE, usage: ZERO_USAGE });

    await agent.generateFoundation(baseBook());
    const system = (chat.mock.calls[0]?.[0] as Array<{ content: string }>)[0]?.content ?? "";

    expect(system).toContain("story_frame ≤ 3000 chars");
    expect(system).toContain("volume_map ≤ 5000 chars");
    expect(system).toContain("roles 总 ≤ 8000 chars");
    expect(system).toContain("book_rules ≤ 500 chars");
    expect(system).toContain("pending_hooks ≤ 2000 chars");
  });

  it("the English prompt also carries the 5-section / dedup / budget rules", async () => {
    const agent = buildAgent();
    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({ content: CONSOLIDATED_RESPONSE, usage: ZERO_USAGE });

    const enBook: BookConfig = { ...baseBook(), language: "en" };
    await agent.generateFoundation(enBook);
    const system = (chat.mock.calls[0]?.[0] as Array<{ content: string }>)[0]?.content ?? "";

    const headers = [...system.matchAll(/^=== SECTION: ([a-z_]+) ===$/gim)]
      .map((match) => match[1]);
    expect(headers).toEqual([
      "story_frame",
      "volume_map",
      "roles",
      "book_rules",
      "pending_hooks",
    ]);
    expect(system).toContain("story_frame ≤ 3000 chars");
    expect(system).toContain("YAML only");
  });

  it("book_rules prompt block instructs YAML only, no prose", async () => {
    const agent = buildAgent();
    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({ content: CONSOLIDATED_RESPONSE, usage: ZERO_USAGE });

    await agent.generateFoundation(baseBook());
    const system = (chat.mock.calls[0]?.[0] as Array<{ content: string }>)[0]?.content ?? "";

    expect(system).toContain("只输出 YAML frontmatter 一块——零散文");
    // The pre-consolidation prompt used to ask for `## 叙事视角` AND
    // `## 核心冲突驱动` prose blocks inside book_rules — those are gone.
    expect(system).not.toMatch(/=== SECTION: book_rules ===[\s\S]*?## 叙事视角/);
    expect(system).not.toMatch(/=== SECTION: book_rules ===[\s\S]*?## 核心冲突驱动/);
  });
});

describe("Phase 5 consolidation — parser accepts 5-section output", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "inkos-phase5-cons-"));
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("accepts a response with no current_state section and still writes current_state.md as seed", async () => {
    const agent = buildAgent();
    vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({ content: CONSOLIDATED_RESPONSE, usage: ZERO_USAGE });

    const out = await agent.generateFoundation(baseBook());
    await agent.writeFoundationFiles(bookDir, out, false, "zh");

    // Architect output carries an empty currentState string (no section emitted)
    expect(out.currentState).toBe("");

    // current_state.md on disk is the seed placeholder, not empty.
    const seed = await readFile(join(bookDir, "story/current_state.md"), "utf-8");
    expect(isCurrentStateSeedPlaceholder(seed)).toBe(true);
    expect(seed).toContain("建书时占位");
  });

  it("preserves legacy 7-section input (current_state + rhythm_principles still present)", async () => {
    const legacyResponse = [
      "=== SECTION: story_frame ===",
      "# frame",
      "=== SECTION: volume_map ===",
      "# map",
      "=== SECTION: rhythm_principles ===",
      "# legacy rhythm — accepted but no longer required",
      "=== SECTION: roles ===",
      "---ROLE---",
      "tier: major",
      "name: 林辞",
      "---CONTENT---",
      "## 核心标签",
      "沉默",
      "## 反差细节",
      "会给流浪狗留罐头",
      "## 人物小传",
      "过往。",
      "## 当前现状",
      "码头账房。",
      "## 关系网络",
      "无。",
      "## 内在驱动",
      "查清真相。",
      "## 成长弧光",
      "从独行到托付。",
      "=== SECTION: book_rules ===",
      "---",
      "version: \"1.0\"",
      "---",
      "",
      "## 叙事视角",
      "第三人称（legacy prose body — parser accepts but it no longer drives anything）",
      "=== SECTION: current_state ===",
      "| 字段 | 值 |",
      "| --- | --- |",
      "| 当前章节 | 0 |",
      "| 当前位置 | 码头 |",
      "=== SECTION: pending_hooks ===",
      "| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 备注 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| H01 | 1 | 主线 | 未开启 | 0 | 终章 | 终局 | 父亲的笔记本 |",
    ].join("\n");

    const agent = buildAgent();
    vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({ content: legacyResponse, usage: ZERO_USAGE });

    const out = await agent.generateFoundation(baseBook());

    // Legacy content is preserved as-is
    expect(out.currentState).toContain("当前位置");
    expect(out.rhythmPrinciples).toContain("legacy rhythm");
    expect((out.roles ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("Phase 5 consolidation — readCurrentStateWithFallback derives initial state", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "inkos-phase5-fallback-"));
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
  });

  it("returns a derived block built from roles/*.Current_State + seed hooks when current_state.md is a seed placeholder", async () => {
    const agent = buildAgent();
    vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({ content: CONSOLIDATED_RESPONSE, usage: ZERO_USAGE });

    const out = await agent.generateFoundation(baseBook());
    await agent.writeFoundationFiles(bookDir, out, false, "zh");

    const derived = await readCurrentStateWithFallback(bookDir, "(missing)");
    // Derived block should mention the role names and their Current_State text.
    expect(derived).toContain("初始状态");
    expect(derived).toContain("林辞");
    expect(derived).toContain("码头边上的旧书店做账房");
    expect(derived).toContain("沈默");
    expect(derived).toContain("新任区域办公室副职");
    // Seed hook row startChapter=0 surfaces in the derived block.
    expect(derived).toContain("H02");
  });

  it("returns the file content as-is when current_state.md already has runtime content", async () => {
    const storyDir = join(bookDir, "story");
    await mkdir(storyDir, { recursive: true });
    const runtime = "# 当前状态\n\n- 第 5 章后主角正式加入合作社。\n- 与体制的关系：明面协作、暗中抵抗。\n";
    await writeFile(join(storyDir, "current_state.md"), runtime, "utf-8");

    const derived = await readCurrentStateWithFallback(bookDir, "(missing)");
    expect(derived).toBe(runtime);
  });

  it("isCurrentStateSeedPlaceholder correctly identifies seeds vs real content", () => {
    expect(isCurrentStateSeedPlaceholder("")).toBe(true);
    expect(isCurrentStateSeedPlaceholder("# 当前状态\n\n> 建书时占位。后续章节补。\n")).toBe(true);
    expect(isCurrentStateSeedPlaceholder("# Current State\n\n> Seeded at book creation.\n")).toBe(true);
    // A real consolidator-appended block — no seed marker
    expect(isCurrentStateSeedPlaceholder("# 当前状态\n\n- 主角现状一二三\n- 体制关系四五六\n")).toBe(false);
    // A long file that happens to contain the seed marker in prose — NOT a seed
    const longContent = "# 当前状态\n\n" + "一段很长的实际内容。".repeat(200) + "\n建书时占位\n";
    expect(isCurrentStateSeedPlaceholder(longContent)).toBe(false);
  });
});
