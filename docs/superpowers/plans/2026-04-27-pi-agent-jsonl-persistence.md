# Pi-Agent JSONL 持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 InkOS pi-agent session 持久化改成单层 JSONL transcript，并让恢复后的 `Agent.state.messages` 保留 raw `AgentMessage`、toolResult 和 thinking。

**Architecture:** core 新增 transcript schema、codec、restore、legacy migration 四个小模块；`book-session-store` 从 transcript 派生旧 API 形状；`runAgentSession` 负责从 transcript 恢复 Agent、订阅 pi-agent-core `message_end` 写入 transcript，并用 `request_committed` 做恢复栅栏。Studio API 保持现有响应形状，但停止把 user/assistant 追加写入 legacy `BookSession` JSON。

**Tech Stack:** TypeScript、Zod、Vitest、Node `fs/promises`、`@mariozechner/pi-agent-core`、`@mariozechner/pi-ai`。

---

## 文件结构

- Create: `packages/core/src/interaction/session-transcript-schema.ts`
  - 定义 transcript event schema、类型、role helper、raw `AgentMessage` 容器。
- Create: `packages/core/src/interaction/session-transcript.ts`
  - 负责 `.inkos/sessions/{sessionId}.jsonl` 路径、append/read、seq 分配、per-session append queue。
- Create: `packages/core/src/interaction/session-transcript-restore.ts`
  - 负责 committed request 恢复、模型合法性清理、UI `BookSession` 派生。
- Create: `packages/core/src/interaction/session-transcript-legacy.ts`
  - 负责 legacy `.json` 到 JSONL 的一次性兼容迁移。
- Modify: `packages/core/src/interaction/book-session-store.ts`
  - 保持原导出 API，但实现改为优先 JSONL，legacy JSON 只作为输入。
- Modify: `packages/core/src/agent/agent-session.ts`
  - 删除 plain message 恢复主路径，改为 raw transcript restore/write。
- Modify: `packages/core/src/index.ts`
  - 导出 transcript helper 和类型。
- Modify: `packages/studio/src/api/server.ts`
  - `/api/v1/agent` 不再构造 `initialMessages`，不再 append/persist legacy BookSession JSON。
- Test: `packages/core/src/__tests__/session-transcript.test.ts`
- Test: `packages/core/src/__tests__/session-transcript-restore.test.ts`
- Test: `packages/core/src/__tests__/book-session-store.test.ts`
- Test: `packages/core/src/__tests__/agent-session.test.ts`
- Test: `packages/studio/src/api/server.test.ts`

---

### Task 1: JSONL transcript schema 和 codec

**Files:**
- Create: `packages/core/src/interaction/session-transcript-schema.ts`
- Create: `packages/core/src/interaction/session-transcript.ts`
- Create: `packages/core/src/__tests__/session-transcript.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/core/src/__tests__/session-transcript.test.ts` 新增：

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendTranscriptEvent,
  nextTranscriptSeq,
  readTranscriptEvents,
  transcriptPath,
} from "../interaction/session-transcript.js";
import type { MessageEvent, RequestCommittedEvent, RequestStartedEvent } from "../interaction/session-transcript-schema.js";

describe("session transcript codec", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "inkos-transcript-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("一行写入一个 JSON event 并保留 raw AgentMessage 字段", async () => {
    const started: RequestStartedEvent = {
      type: "request_started",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      seq: 1,
      timestamp: 100,
      input: "继续写",
    };
    const message: MessageEvent = {
      type: "message",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      uuid: "m1",
      parentUuid: null,
      seq: 2,
      role: "assistant",
      timestamp: 101,
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "推理", signature: "sig-1" },
          { type: "text", text: "正文" },
        ],
        provider: "anthropic",
        api: "anthropic-messages",
        model: "claude",
        usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: 101,
      },
    };
    await appendTranscriptEvent(projectRoot, started);
    await appendTranscriptEvent(projectRoot, message);

    const raw = await readFile(transcriptPath(projectRoot, "s1"), "utf-8");
    expect(raw.trim().split("\n")).toHaveLength(2);

    const events = await readTranscriptEvents(projectRoot, "s1");
    expect(events).toHaveLength(2);
    expect((events[1] as MessageEvent).message).toMatchObject({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "推理", signature: "sig-1" },
        { type: "text", text: "正文" },
      ],
    });
  });

  it("跳过坏行并保留合法 event", async () => {
    const dir = join(projectRoot, ".inkos", "sessions");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "s1.jsonl"),
      [
        JSON.stringify({ type: "request_started", version: 1, sessionId: "s1", requestId: "r1", seq: 1, timestamp: 1, input: "hi" }),
        "{bad json",
        JSON.stringify({ type: "request_committed", version: 1, sessionId: "s1", requestId: "r1", seq: 2, timestamp: 2 }),
      ].join("\n"),
    );

    const events = await readTranscriptEvents(projectRoot, "s1");
    expect(events.map((event) => event.type)).toEqual(["request_started", "request_committed"]);
  });

  it("按已有 transcript 分配单调递增 seq", async () => {
    const committed: RequestCommittedEvent = {
      type: "request_committed",
      version: 1,
      sessionId: "s1",
      requestId: "r1",
      seq: 7,
      timestamp: 100,
    };
    await appendTranscriptEvent(projectRoot, committed);
    await expect(nextTranscriptSeq(projectRoot, "s1")).resolves.toBe(8);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- session-transcript.test.ts
```

预期: FAIL，错误包含 `Cannot find module '../interaction/session-transcript.js'`。

- [ ] **Step 3: 实现 schema**

创建 `packages/core/src/interaction/session-transcript-schema.ts`：

```ts
import { z } from "zod";

export const TranscriptRoleSchema = z.enum(["user", "assistant", "toolResult", "system"]);
export type TranscriptRole = z.infer<typeof TranscriptRoleSchema>;

const BaseEventSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
});

export const SessionCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal("session_created"),
  bookId: z.string().nullable(),
  title: z.string().nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const SessionMetadataUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal("session_metadata_updated"),
  bookId: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  updatedAt: z.number().int().nonnegative(),
});

export const RequestStartedEventSchema = BaseEventSchema.extend({
  type: z.literal("request_started"),
  requestId: z.string().min(1),
  input: z.string(),
});

export const RequestCommittedEventSchema = BaseEventSchema.extend({
  type: z.literal("request_committed"),
  requestId: z.string().min(1),
});

export const RequestFailedEventSchema = BaseEventSchema.extend({
  type: z.literal("request_failed"),
  requestId: z.string().min(1),
  error: z.string(),
});

export const MessageEventSchema = BaseEventSchema.extend({
  type: z.literal("message"),
  requestId: z.string().min(1),
  uuid: z.string().min(1),
  parentUuid: z.string().min(1).nullable(),
  role: TranscriptRoleSchema,
  piTurnIndex: z.number().int().nonnegative().optional(),
  toolCallId: z.string().min(1).optional(),
  sourceToolAssistantUuid: z.string().min(1).optional(),
  legacyDisplay: z.object({
    thinking: z.string().optional(),
    toolExecutions: z.array(z.unknown()).optional(),
  }).optional(),
  message: z.unknown(),
});

export const TranscriptEventSchema = z.discriminatedUnion("type", [
  SessionCreatedEventSchema,
  SessionMetadataUpdatedEventSchema,
  RequestStartedEventSchema,
  RequestCommittedEventSchema,
  RequestFailedEventSchema,
  MessageEventSchema,
]);

export type SessionCreatedEvent = z.infer<typeof SessionCreatedEventSchema>;
export type SessionMetadataUpdatedEvent = z.infer<typeof SessionMetadataUpdatedEventSchema>;
export type RequestStartedEvent = z.infer<typeof RequestStartedEventSchema>;
export type RequestCommittedEvent = z.infer<typeof RequestCommittedEventSchema>;
export type RequestFailedEvent = z.infer<typeof RequestFailedEventSchema>;
export type MessageEvent = z.infer<typeof MessageEventSchema>;
export type TranscriptEvent = z.infer<typeof TranscriptEventSchema>;
```

- [ ] **Step 4: 实现 codec**

创建 `packages/core/src/interaction/session-transcript.ts`：

```ts
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { TranscriptEventSchema, type TranscriptEvent } from "./session-transcript-schema.js";

const SESSIONS_DIR = ".inkos/sessions";
const appendQueues = new Map<string, Promise<void>>();

export function sessionsDir(projectRoot: string): string {
  return join(projectRoot, SESSIONS_DIR);
}

export function transcriptPath(projectRoot: string, sessionId: string): string {
  return join(sessionsDir(projectRoot), `${sessionId}.jsonl`);
}

export function legacyBookSessionPath(projectRoot: string, sessionId: string): string {
  return join(sessionsDir(projectRoot), `${sessionId}.json`);
}

export async function readTranscriptEvents(projectRoot: string, sessionId: string): Promise<TranscriptEvent[]> {
  let raw: string;
  try {
    raw = await readFile(transcriptPath(projectRoot, sessionId), "utf-8");
  } catch {
    return [];
  }
  const events: TranscriptEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = TranscriptEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
    } catch {
      continue;
    }
  }
  return events.sort((a, b) => a.seq - b.seq);
}

export async function nextTranscriptSeq(projectRoot: string, sessionId: string): Promise<number> {
  const events = await readTranscriptEvents(projectRoot, sessionId);
  return events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
}

export async function appendTranscriptEvent(projectRoot: string, event: TranscriptEvent): Promise<void> {
  const key = `${projectRoot}:${event.sessionId}`;
  const previous = appendQueues.get(key) ?? Promise.resolve();
  const next = previous.then(async () => {
    await mkdir(sessionsDir(projectRoot), { recursive: true });
    await appendFile(transcriptPath(projectRoot, event.sessionId), `${JSON.stringify(event)}\n`, "utf-8");
  });
  appendQueues.set(key, next.catch(() => undefined));
  await next;
}
```

- [ ] **Step 5: 运行测试确认通过**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- session-transcript.test.ts
```

预期: PASS。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/interaction/session-transcript-schema.ts packages/core/src/interaction/session-transcript.ts packages/core/src/__tests__/session-transcript.test.ts
git commit -m "feat: add session transcript codec"
```

---

### Task 2: committed restore、thinking 和 toolResult 清理

**Files:**
- Create: `packages/core/src/interaction/session-transcript-restore.ts`
- Create: `packages/core/src/__tests__/session-transcript-restore.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/src/__tests__/session-transcript-restore.test.ts`：

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendTranscriptEvent } from "../interaction/session-transcript.js";
import { restoreAgentMessagesFromTranscript } from "../interaction/session-transcript-restore.js";
import type { MessageEvent } from "../interaction/session-transcript-schema.js";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

describe("session transcript restore", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "inkos-restore-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("只恢复已 committed request 内的 message", async () => {
    await appendTranscriptEvent(projectRoot, { type: "request_started", version: 1, sessionId: "s1", requestId: "r1", seq: 1, timestamp: 1, input: "hi" });
    await appendTranscriptEvent(projectRoot, { type: "message", version: 1, sessionId: "s1", requestId: "r1", uuid: "u1", parentUuid: null, seq: 2, role: "user", timestamp: 2, message: { role: "user", content: "hi", timestamp: 2 } } as MessageEvent);
    await appendTranscriptEvent(projectRoot, { type: "request_committed", version: 1, sessionId: "s1", requestId: "r1", seq: 3, timestamp: 3 });
    await appendTranscriptEvent(projectRoot, { type: "request_started", version: 1, sessionId: "s1", requestId: "r2", seq: 4, timestamp: 4, input: "lost" });
    await appendTranscriptEvent(projectRoot, { type: "message", version: 1, sessionId: "s1", requestId: "r2", uuid: "u2", parentUuid: "u1", seq: 5, role: "user", timestamp: 5, message: { role: "user", content: "lost", timestamp: 5 } } as MessageEvent);

    const restored = await restoreAgentMessagesFromTranscript(projectRoot, "s1");
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ role: "user", content: "hi" });
  });

  it("保留 committed toolResult 和 assistant thinking signature", async () => {
    await appendTranscriptEvent(projectRoot, { type: "request_started", version: 1, sessionId: "s1", requestId: "r1", seq: 1, timestamp: 1, input: "tool" });
    await appendTranscriptEvent(projectRoot, {
      type: "message", version: 1, sessionId: "s1", requestId: "r1", uuid: "a1", parentUuid: null, seq: 2, role: "assistant", timestamp: 2,
      toolCallId: "tool-1",
      message: { role: "assistant", content: [{ type: "thinking", thinking: "需要查资料", signature: "sig" }, { type: "toolCall", id: "tool-1", name: "read", arguments: { path: "a.md" } }], api: "anthropic-messages", provider: "anthropic", model: "claude", usage, stopReason: "tool_use", timestamp: 2 },
    } as MessageEvent);
    await appendTranscriptEvent(projectRoot, {
      type: "message", version: 1, sessionId: "s1", requestId: "r1", uuid: "t1", parentUuid: "a1", seq: 3, role: "toolResult", timestamp: 3,
      toolCallId: "tool-1",
      sourceToolAssistantUuid: "a1",
      message: { role: "toolResult", toolCallId: "tool-1", toolName: "read", content: [{ type: "text", text: "资料" }], details: { path: "a.md" }, isError: false, timestamp: 3 },
    } as MessageEvent);
    await appendTranscriptEvent(projectRoot, { type: "request_committed", version: 1, sessionId: "s1", requestId: "r1", seq: 4, timestamp: 4 });

    const restored = await restoreAgentMessagesFromTranscript(projectRoot, "s1");
    expect(restored).toHaveLength(2);
    expect(restored[0]).toMatchObject({ role: "assistant", content: [{ type: "thinking", thinking: "需要查资料", signature: "sig" }] });
    expect(restored[1]).toMatchObject({ role: "toolResult", toolCallId: "tool-1", toolName: "read" });
  });

  it("移除最后 assistant message 的 trailing thinking block", async () => {
    await appendTranscriptEvent(projectRoot, { type: "request_started", version: 1, sessionId: "s1", requestId: "r1", seq: 1, timestamp: 1, input: "hi" });
    await appendTranscriptEvent(projectRoot, {
      type: "message", version: 1, sessionId: "s1", requestId: "r1", uuid: "a1", parentUuid: null, seq: 2, role: "assistant", timestamp: 2,
      message: { role: "assistant", content: [{ type: "text", text: "回答" }, { type: "thinking", thinking: "尾部", signature: "sig" }], api: "anthropic-messages", provider: "anthropic", model: "claude", usage, stopReason: "stop", timestamp: 2 },
    } as MessageEvent);
    await appendTranscriptEvent(projectRoot, { type: "request_committed", version: 1, sessionId: "s1", requestId: "r1", seq: 3, timestamp: 3 });

    const restored = await restoreAgentMessagesFromTranscript(projectRoot, "s1");
    expect((restored[0] as any).content).toEqual([{ type: "text", text: "回答" }]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- session-transcript-restore.test.ts
```

预期: FAIL，错误包含 `Cannot find module '../interaction/session-transcript-restore.js'`。

- [ ] **Step 3: 实现 restore 和清理**

创建 `packages/core/src/interaction/session-transcript-restore.ts`：

```ts
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { readTranscriptEvents } from "./session-transcript.js";
import type { MessageEvent, TranscriptEvent } from "./session-transcript-schema.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function hasTextContent(message: Record<string, unknown>): boolean {
  const content = message.content;
  return Array.isArray(content) && content.some((block) => isObject(block) && block.type === "text" && typeof block.text === "string" && block.text.length > 0);
}

function hasToolCallContent(message: Record<string, unknown>): boolean {
  const content = message.content;
  return Array.isArray(content) && content.some((block) => isObject(block) && block.type === "toolCall" && typeof block.id === "string");
}

function toolCallIds(message: Record<string, unknown>): string[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block): block is Record<string, unknown> => isObject(block) && block.type === "toolCall" && typeof block.id === "string")
    .map((block) => block.id as string);
}

export function cleanRestoredAgentMessages(messages: AgentMessage[]): AgentMessage[] {
  const availableToolCalls = new Set<string>();
  for (const message of messages) {
    if (isObject(message) && message.role === "assistant") {
      for (const id of toolCallIds(message)) availableToolCalls.add(id);
    }
  }

  const cleaned = messages.filter((message) => {
    if (!isObject(message)) return false;
    if (message.role === "toolResult") {
      return typeof message.toolCallId === "string" && availableToolCalls.has(message.toolCallId);
    }
    if (message.role === "assistant") {
      return hasTextContent(message) || hasToolCallContent(message);
    }
    return message.role === "user" || message.role === "system";
  });

  for (let i = cleaned.length - 1; i >= 0; i--) {
    const message = cleaned[i] as Record<string, unknown>;
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    const filtered = message.content.filter((block) => !(isObject(block) && (block.type === "thinking" || block.type === "redacted_thinking")));
    cleaned[i] = { ...message, content: filtered } as AgentMessage;
    break;
  }

  return cleaned;
}

export function committedMessageEvents(events: TranscriptEvent[]): MessageEvent[] {
  const committed = new Set(
    events
      .filter((event) => event.type === "request_committed")
      .map((event) => event.requestId),
  );
  return events
    .filter((event): event is MessageEvent => event.type === "message" && committed.has(event.requestId))
    .sort((a, b) => a.seq - b.seq);
}

export async function restoreAgentMessagesFromTranscript(projectRoot: string, sessionId: string): Promise<AgentMessage[]> {
  const events = await readTranscriptEvents(projectRoot, sessionId);
  return cleanRestoredAgentMessages(committedMessageEvents(events).map((event) => event.message as AgentMessage));
}
```

- [ ] **Step 4: 运行测试确认通过**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- session-transcript-restore.test.ts
```

预期: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/interaction/session-transcript-restore.ts packages/core/src/__tests__/session-transcript-restore.test.ts
git commit -m "feat: restore committed transcript messages"
```

---

### Task 3: 从 transcript 派生 BookSession 视图并迁移 legacy JSON

**Files:**
- Modify: `packages/core/src/interaction/session-transcript-restore.ts`
- Create: `packages/core/src/interaction/session-transcript-legacy.ts`
- Modify: `packages/core/src/__tests__/session-transcript-restore.test.ts`
- Modify: `packages/core/src/__tests__/book-session-store.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/core/src/__tests__/session-transcript-restore.test.ts` 增加：

```ts
import { deriveBookSessionFromTranscript } from "../interaction/session-transcript-restore.js";

it("从 transcript 派生 BookSession UI 视图", async () => {
  await appendTranscriptEvent(projectRoot, { type: "session_created", version: 1, sessionId: "s1", seq: 1, timestamp: 1, bookId: "book-a", title: null, createdAt: 1, updatedAt: 1 });
  await appendTranscriptEvent(projectRoot, { type: "request_started", version: 1, sessionId: "s1", requestId: "r1", seq: 2, timestamp: 2, input: "第一条问题" });
  await appendTranscriptEvent(projectRoot, { type: "message", version: 1, sessionId: "s1", requestId: "r1", uuid: "u1", parentUuid: null, seq: 3, role: "user", timestamp: 3, message: { role: "user", content: "第一条问题", timestamp: 3 } } as MessageEvent);
  await appendTranscriptEvent(projectRoot, {
    type: "message", version: 1, sessionId: "s1", requestId: "r1", uuid: "a1", parentUuid: "u1", seq: 4, role: "assistant", timestamp: 4,
    message: { role: "assistant", content: [{ type: "thinking", thinking: "思考" }, { type: "text", text: "回答" }], api: "anthropic-messages", provider: "anthropic", model: "claude", usage, stopReason: "stop", timestamp: 4 },
  } as MessageEvent);
  await appendTranscriptEvent(projectRoot, { type: "request_committed", version: 1, sessionId: "s1", requestId: "r1", seq: 5, timestamp: 5 });

  const session = await deriveBookSessionFromTranscript(projectRoot, "s1");
  expect(session).toMatchObject({
    sessionId: "s1",
    bookId: "book-a",
    title: "第一条问题",
    messages: [
      { role: "user", content: "第一条问题" },
      { role: "assistant", content: "回答", thinking: "思考" },
    ],
  });
});
```

在 `packages/core/src/__tests__/book-session-store.test.ts` 增加 legacy migration 断言：

```ts
it("读取 legacy JSON 时迁移为 JSONL 并保留 UI thinking", async () => {
  const session = {
    ...createBookSession("book-a", "legacy-1"),
    messages: [
      { role: "user" as const, content: "继续", timestamp: 10 },
      { role: "assistant" as const, content: "好的", thinking: "旧思考", timestamp: 11 },
    ],
  };
  await persistBookSession(tempDir, session);

  const loaded = await loadBookSession(tempDir, "legacy-1");
  expect(loaded).toMatchObject({
    sessionId: "legacy-1",
    bookId: "book-a",
    messages: [
      { role: "user", content: "继续" },
      { role: "assistant", content: "好的", thinking: "旧思考" },
    ],
  });
  await expect(readFile(join(tempDir, ".inkos", "sessions", "legacy-1.jsonl"), "utf-8")).resolves.toContain("request_committed");
});
```

- [ ] **Step 2: 运行测试确认失败**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- session-transcript-restore.test.ts book-session-store.test.ts
```

预期: FAIL，错误包含 `deriveBookSessionFromTranscript is not a function`。

- [ ] **Step 3: 实现 BookSession 派生**

在 `packages/core/src/interaction/session-transcript-restore.ts` 增加：

```ts
import { BookSessionSchema, type BookSession, type InteractionMessage, type ToolExecution } from "./session.js";

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: string; text: string } => isObject(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function thinkingFromContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const value = content
    .filter((block): block is Record<string, unknown> => isObject(block) && block.type === "thinking")
    .map((block) => typeof block.thinking === "string" ? block.thinking : "")
    .join("");
  return value || undefined;
}

function firstUserMessageTitle(messages: InteractionMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const oneLine = message.content.trim().replace(/\s+/g, " ");
    if (!oneLine) return null;
    return oneLine.length > 20 ? `${oneLine.slice(0, 20)}…` : oneLine;
  }
  return null;
}

function messageEventToInteractionMessage(event: MessageEvent): InteractionMessage | null {
  const raw = event.message as Record<string, unknown>;
  if (!isObject(raw)) return null;
  if (event.role === "toolResult") return null;
  if (event.role === "user") {
    const content = textFromContent(raw.content);
    return content ? { role: "user", content, timestamp: event.timestamp } : null;
  }
  if (event.role === "assistant") {
    const content = textFromContent(raw.content);
    const thinking = thinkingFromContent(raw.content) ?? event.legacyDisplay?.thinking;
    if (!content && !thinking) return null;
    return {
      role: "assistant",
      content,
      ...(thinking ? { thinking } : {}),
      ...(event.legacyDisplay?.toolExecutions ? { toolExecutions: event.legacyDisplay.toolExecutions as ToolExecution[] } : {}),
      timestamp: event.timestamp,
    };
  }
  return null;
}

export async function deriveBookSessionFromTranscript(projectRoot: string, sessionId: string): Promise<BookSession | null> {
  const events = await readTranscriptEvents(projectRoot, sessionId);
  if (events.length === 0) return null;

  const created = events.find((event) => event.type === "session_created");
  let bookId = created?.type === "session_created" ? created.bookId : null;
  let title = created?.type === "session_created" ? created.title : null;
  let createdAt = created?.type === "session_created" ? created.createdAt : events[0]?.timestamp ?? Date.now();
  let updatedAt = created?.type === "session_created" ? created.updatedAt : events[events.length - 1]?.timestamp ?? createdAt;

  for (const event of events) {
    if (event.type === "session_metadata_updated") {
      if ("bookId" in event) bookId = event.bookId ?? bookId;
      if ("title" in event) title = event.title ?? title;
      updatedAt = event.updatedAt;
    }
  }

  const messages = committedMessageEvents(events)
    .map(messageEventToInteractionMessage)
    .filter((message): message is InteractionMessage => message !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (title === null) {
    title = firstUserMessageTitle(messages);
  }

  return BookSessionSchema.parse({
    sessionId,
    bookId,
    title,
    messages,
    draftRounds: [],
    events: [],
    createdAt,
    updatedAt,
  });
}
```

- [ ] **Step 4: 实现 legacy 转换**

创建 `packages/core/src/interaction/session-transcript-legacy.ts`：

```ts
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { BookSessionSchema, type BookSession } from "./session.js";
import { appendTranscriptEvent, legacyBookSessionPath, nextTranscriptSeq, readTranscriptEvents } from "./session-transcript.js";
import type { MessageEvent } from "./session-transcript-schema.js";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

export async function readLegacyBookSession(projectRoot: string, sessionId: string): Promise<BookSession | null> {
  try {
    const raw = await readFile(legacyBookSessionPath(projectRoot, sessionId), "utf-8");
    return BookSessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function migrateLegacyBookSessionToTranscript(projectRoot: string, session: BookSession): Promise<void> {
  const existing = await readTranscriptEvents(projectRoot, session.sessionId);
  if (existing.length > 0) return;
  let seq = await nextTranscriptSeq(projectRoot, session.sessionId);
  await appendTranscriptEvent(projectRoot, {
    type: "session_created",
    version: 1,
    sessionId: session.sessionId,
    seq: seq++,
    timestamp: session.createdAt,
    bookId: session.bookId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
  const requestId = `legacy-${session.sessionId}`;
  await appendTranscriptEvent(projectRoot, { type: "request_started", version: 1, sessionId: session.sessionId, requestId, seq: seq++, timestamp: session.createdAt, input: "" });
  let parentUuid: string | null = null;
  for (const legacyMessage of session.messages) {
    const uuid = randomUUID();
    const message = legacyMessage.role === "assistant"
      ? { role: "assistant", content: [{ type: "text", text: legacyMessage.content }], api: "anthropic-messages", provider: "legacy", model: "unknown", usage, stopReason: "stop", timestamp: legacyMessage.timestamp }
      : { role: legacyMessage.role, content: legacyMessage.content, timestamp: legacyMessage.timestamp };
    const event: MessageEvent = {
      type: "message",
      version: 1,
      sessionId: session.sessionId,
      requestId,
      uuid,
      parentUuid,
      seq: seq++,
      role: legacyMessage.role === "assistant" ? "assistant" : legacyMessage.role,
      timestamp: legacyMessage.timestamp,
      legacyDisplay: legacyMessage.role === "assistant" && legacyMessage.thinking ? { thinking: legacyMessage.thinking } : undefined,
      message,
    };
    await appendTranscriptEvent(projectRoot, event);
    parentUuid = uuid;
  }
  await appendTranscriptEvent(projectRoot, { type: "request_committed", version: 1, sessionId: session.sessionId, requestId, seq: seq++, timestamp: session.updatedAt });
}
```

- [ ] **Step 5: 运行测试确认通过**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- session-transcript-restore.test.ts book-session-store.test.ts
```

预期: PASS。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/interaction/session-transcript-restore.ts packages/core/src/interaction/session-transcript-legacy.ts packages/core/src/__tests__/session-transcript-restore.test.ts packages/core/src/__tests__/book-session-store.test.ts
git commit -m "feat: derive sessions from transcripts"
```

---

### Task 4: book-session-store 切换到 JSONL canonical path

**Files:**
- Modify: `packages/core/src/interaction/book-session-store.ts`
- Modify: `packages/core/src/__tests__/book-session-store.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/core/src/__tests__/book-session-store.test.ts` 增加：

```ts
it("createAndPersistBookSession 为新 session 写 JSONL 而不是 legacy JSON", async () => {
  const session = await createAndPersistBookSession(tempDir, "book-a", "123456-abcdef");
  expect(session.sessionId).toBe("123456-abcdef");

  await expect(readFile(join(tempDir, ".inkos", "sessions", "123456-abcdef.jsonl"), "utf-8")).resolves.toContain("session_created");
  await expect(readFile(join(tempDir, ".inkos", "sessions", "123456-abcdef.json"), "utf-8")).rejects.toThrow();
});

it("renameBookSession 追加 metadata event 并从 JSONL 派生新标题", async () => {
  await createAndPersistBookSession(tempDir, "book-a", "123456-abcdef");
  const renamed = await renameBookSession(tempDir, "123456-abcdef", "新标题");
  expect(renamed!.title).toBe("新标题");

  const loaded = await loadBookSession(tempDir, "123456-abcdef");
  expect(loaded!.title).toBe("新标题");
});

it("listBookSessions 同时列出 JSONL session 和未迁移 legacy JSON session", async () => {
  await createAndPersistBookSession(tempDir, "book-a", "123456-abcdef");
  const legacy = { ...createBookSession("book-a", "legacy-1"), updatedAt: 999 };
  await writeFile(join(tempDir, ".inkos", "sessions", "legacy-1.json"), JSON.stringify(legacy));

  const list = await listBookSessions(tempDir, "book-a");
  expect(list.map((entry) => entry.sessionId).sort()).toEqual(["123456-abcdef", "legacy-1"]);
});
```

- [ ] **Step 2: 运行测试确认失败**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- book-session-store.test.ts
```

预期: FAIL，新 session 仍然写 `.json`。

- [ ] **Step 3: 改写 store**

在 `packages/core/src/interaction/book-session-store.ts` 中保留导出名，改为调用 transcript helper。核心实现形状：

```ts
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createBookSession, type BookSession } from "./session.js";
import { appendTranscriptEvent, legacyBookSessionPath, nextTranscriptSeq, readTranscriptEvents, sessionsDir, transcriptPath } from "./session-transcript.js";
import { deriveBookSessionFromTranscript } from "./session-transcript-restore.js";
import { migrateLegacyBookSessionToTranscript, readLegacyBookSession } from "./session-transcript-legacy.js";

export async function loadBookSession(projectRoot: string, sessionId: string): Promise<BookSession | null> {
  const fromTranscript = await deriveBookSessionFromTranscript(projectRoot, sessionId);
  if (fromTranscript) return fromTranscript;
  const legacy = await readLegacyBookSession(projectRoot, sessionId);
  if (!legacy) return null;
  await migrateLegacyBookSessionToTranscript(projectRoot, legacy);
  return deriveBookSessionFromTranscript(projectRoot, sessionId);
}

export async function persistBookSession(projectRoot: string, session: BookSession): Promise<void> {
  const existing = await readTranscriptEvents(projectRoot, session.sessionId);
  if (existing.length === 0) {
    await migrateLegacyBookSessionToTranscript(projectRoot, session);
    return;
  }
  const seq = await nextTranscriptSeq(projectRoot, session.sessionId);
  await appendTranscriptEvent(projectRoot, {
    type: "session_metadata_updated",
    version: 1,
    sessionId: session.sessionId,
    seq,
    timestamp: Date.now(),
    bookId: session.bookId,
    title: session.title,
    updatedAt: session.updatedAt,
  });
}
```

然后逐个改写：

```ts
export async function createAndPersistBookSession(projectRoot: string, bookId: string | null, sessionId?: string): Promise<BookSession> {
  if (sessionId) {
    const existing = await loadBookSession(projectRoot, sessionId);
    if (existing) return existing;
  }
  const session = createBookSession(bookId, sessionId);
  await appendTranscriptEvent(projectRoot, {
    type: "session_created",
    version: 1,
    sessionId: session.sessionId,
    seq: 1,
    timestamp: session.createdAt,
    bookId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
  return session;
}

export async function renameBookSession(projectRoot: string, sessionId: string, title: string): Promise<BookSession | null> {
  const session = await loadBookSession(projectRoot, sessionId);
  if (!session) return null;
  const updatedAt = Date.now();
  await appendTranscriptEvent(projectRoot, {
    type: "session_metadata_updated",
    version: 1,
    sessionId,
    seq: await nextTranscriptSeq(projectRoot, sessionId),
    timestamp: updatedAt,
    title,
    updatedAt,
  });
  return loadBookSession(projectRoot, sessionId);
}
```

`listBookSessions()` 扫描 `.jsonl` 和 `.json`，对 `.json` 调用 `loadBookSession()` 触发迁移后再派生 summary；`deleteBookSession()` 同时删除 `.jsonl` 和 `.json`；`migrateBookSession()` 写 `session_metadata_updated` 的 `bookId`。

- [ ] **Step 4: 运行测试确认通过**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- book-session-store.test.ts session-transcript.test.ts session-transcript-restore.test.ts
```

预期: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/interaction/book-session-store.ts packages/core/src/__tests__/book-session-store.test.ts
git commit -m "feat: use jsonl for book sessions"
```

---

### Task 5: runAgentSession 从 JSONL 恢复 raw AgentMessage 并写入 transcript

**Files:**
- Modify: `packages/core/src/agent/agent-session.ts`
- Modify: `packages/core/src/__tests__/agent-session.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/core/src/__tests__/agent-session.test.ts` 的 FakeAgent 中改造 `subscribe()`，让测试能模拟 pi-agent-core event：

```ts
class FakeAgent {
  listeners: Array<(event: any) => void> = [];
  state: any;
  transformContext: any;
  streamFn: any;
  getApiKey: any;
  constructor(options: any) {
    this.state = {
      model: options.initialState?.model,
      systemPrompt: options.initialState?.systemPrompt,
      tools: options.initialState?.tools ?? [],
      messages: options.initialState?.messages ?? [],
    };
    this.transformContext = options.transformContext;
    this.streamFn = options.streamFn;
    this.getApiKey = options.getApiKey;
    agentInstances.push(this);
  }
  subscribe(listener: (event: any) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener);
    };
  }
  emit(event: any) {
    for (const listener of this.listeners) listener(event);
  }
  async prompt(userMessage: string) {
    const now = Date.now();
    const user = { role: "user", content: userMessage, timestamp: now };
    const assistant = {
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "fake",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: now + 1,
    };
    this.emit({ type: "turn_start" });
    this.emit({ type: "message_end", message: user });
    this.state.messages.push(user);
    this.emit({ type: "message_end", message: assistant });
    this.state.messages.push(assistant);
    this.emit({ type: "turn_end", message: assistant, toolResults: [] });
    this.emit({ type: "agent_end", messages: [user, assistant] });
  }
}
```

新增测试：

```ts
it("把 message_end 写入 JSONL，并在 cache 失效后恢复 raw AgentMessage", async () => {
  const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
  const pipeline = {} as any;

  await runAgentSession(
    { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
    "hi",
  );

  evictAgentCache("s1");

  await runAgentSession(
    { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
    "again",
  );

  expect(agentInstances).toHaveLength(2);
  expect(agentInstances[1].state.messages[0]).toMatchObject({ role: "user", content: "hi" });
  expect(agentInstances[1].state.messages[1]).toMatchObject({ role: "assistant", content: [{ type: "text", text: "ok" }] });
});

it("恢复 transcript 中的 toolResult message", async () => {
  const model = { provider: "x", id: "y", api: "anthropic-messages" } as any;
  const pipeline = {} as any;

  await runAgentSession(
    { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
    "hi",
  );
  const first = agentInstances[0];
  const assistant = {
    role: "assistant",
    content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "a.md" } }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "fake",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "tool_use",
    timestamp: Date.now(),
  };
  const toolResult = { role: "toolResult", toolCallId: "tool-1", toolName: "read", content: [{ type: "text", text: "file" }], details: { path: "a.md" }, isError: false, timestamp: Date.now() + 1 };
  first.emit({ type: "message_end", message: assistant });
  first.emit({ type: "message_end", message: toolResult });
  first.state.messages.push(assistant, toolResult);

  evictAgentCache("s1");

  await runAgentSession(
    { sessionId: "s1", bookId: "book-a", language: "zh", pipeline, projectRoot, model },
    "again",
  );

  expect(agentInstances[1].state.messages.some((message: any) => message.role === "toolResult" && message.toolCallId === "tool-1")).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- agent-session.test.ts
```

预期: FAIL，第二个 Agent 没有从 JSONL 恢复历史。

- [ ] **Step 3: 改 AgentSession 类型和 cache**

在 `packages/core/src/agent/agent-session.ts` 中：

```ts
import { randomUUID } from "node:crypto";
import { appendTranscriptEvent, nextTranscriptSeq, readTranscriptEvents } from "../interaction/session-transcript.js";
import { restoreAgentMessagesFromTranscript } from "../interaction/session-transcript-restore.js";
```

调整接口：

```ts
export interface AgentSessionResult {
  responseText: string;
  messages: AgentMessage[];
}

interface CachedAgent {
  agent: Agent;
  bookId: string | null;
  modelId: string | null;
  lastCommittedSeq: number;
  lastActive: number;
}
```

新增 helper：

```ts
async function latestCommittedSeq(projectRoot: string, sessionId: string): Promise<number> {
  const events = await readTranscriptEvents(projectRoot, sessionId);
  return events
    .filter((event) => event.type === "request_committed")
    .reduce((max, event) => Math.max(max, event.seq), 0);
}
```

- [ ] **Step 4: 实现恢复和写入**

在创建 Agent 时改成：

```ts
const restoredMessages = await restoreAgentMessagesFromTranscript(projectRoot, sessionId);
const agent = new Agent({
  initialState: {
    model,
    systemPrompt: buildAgentSystemPrompt(bookId, language),
    tools: [...],
    messages: restoredMessages,
  },
  transformContext: createBookContextTransform(bookId, projectRoot),
  streamFn: streamSimple,
  getApiKey: ...
});
```

执行 prompt 前后加入 request event 和 message event：

```ts
const requestId = randomUUID();
let seq = await nextTranscriptSeq(projectRoot, sessionId);
await appendTranscriptEvent(projectRoot, {
  type: "request_started",
  version: 1,
  sessionId,
  requestId,
  seq: seq++,
  timestamp: Date.now(),
  input: userMessage,
});

let parentUuid: string | null = null;
let piTurnIndex = 0;
let lastAssistantUuid: string | null = null;

const persistEvent = async (event: AgentEvent) => {
  if (event.type === "turn_start") piTurnIndex += 1;
  if (event.type !== "message_end") return;
  const message = event.message as any;
  const uuid = randomUUID();
  const role = message.role;
  const toolCallId = role === "toolResult" ? message.toolCallId : Array.isArray(message.content) ? message.content.find((block: any) => block.type === "toolCall")?.id : undefined;
  await appendTranscriptEvent(projectRoot, {
    type: "message",
    version: 1,
    sessionId,
    requestId,
    uuid,
    parentUuid: role === "toolResult" && lastAssistantUuid ? lastAssistantUuid : parentUuid,
    seq: seq++,
    role,
    timestamp: message.timestamp ?? Date.now(),
    piTurnIndex,
    ...(toolCallId ? { toolCallId } : {}),
    ...(role === "toolResult" && lastAssistantUuid ? { sourceToolAssistantUuid: lastAssistantUuid } : {}),
    message,
  });
  if (role === "assistant") lastAssistantUuid = uuid;
  parentUuid = uuid;
};
```

subscription 同时持久化和转发：

```ts
unsubscribe = agent.subscribe(async (event: AgentEvent) => {
  await persistEvent(event);
  onEvent?.(event);
});
```

commit/fail：

```ts
try {
  await agent.prompt(userMessage);
  await appendTranscriptEvent(projectRoot, { type: "request_committed", version: 1, sessionId, requestId, seq: seq++, timestamp: Date.now() });
} catch (error) {
  await appendTranscriptEvent(projectRoot, { type: "request_failed", version: 1, sessionId, requestId, seq: seq++, timestamp: Date.now(), error: error instanceof Error ? error.message : String(error) });
  throw error;
} finally {
  unsubscribe?.();
}
```

返回：

```ts
return { responseText, messages: agent.state.messages.slice() };
```

- [ ] **Step 5: 运行测试确认通过**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- agent-session.test.ts session-transcript.test.ts session-transcript-restore.test.ts
```

预期: PASS。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/agent/agent-session.ts packages/core/src/__tests__/agent-session.test.ts
git commit -m "feat: persist agent messages to transcript"
```

---

### Task 6: Studio API 停止写 legacy BookSession message

**Files:**
- Modify: `packages/studio/src/api/server.ts`
- Modify: `packages/studio/src/api/server.test.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/studio/src/api/server.test.ts` 的 `/api/v1/agent` 测试里加入：

```ts
it("does not append or persist legacy BookSession messages after agent success", async () => {
  runAgentSessionMock.mockResolvedValueOnce({
    responseText: "Agent response.",
    messages: [
      { role: "user", content: "continue", timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: "Agent response." }], timestamp: 2 },
    ],
  });
  loadBookSessionMock
    .mockResolvedValueOnce({
      sessionId: "agent-session-1",
      bookId: "demo-book",
      title: null,
      messages: [],
      events: [],
      draftRounds: [],
      createdAt: 1,
      updatedAt: 1,
    })
    .mockResolvedValueOnce({
      sessionId: "agent-session-1",
      bookId: "demo-book",
      title: "continue",
      messages: [
        { role: "user", content: "continue", timestamp: 1 },
        { role: "assistant", content: "Agent response.", timestamp: 2 },
      ],
      events: [],
      draftRounds: [],
      createdAt: 1,
      updatedAt: 2,
    });

  const { createStudioServer } = await import("./server.js");
  const app = createStudioServer(cloneProjectConfig() as never, root);

  const response = await app.request("http://localhost/api/v1/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction: "continue", activeBookId: "demo-book", sessionId: "agent-session-1" }),
  });

  expect(response.status).toBe(200);
  expect(appendBookSessionMessageMock).not.toHaveBeenCalled();
  expect(persistBookSessionMock).not.toHaveBeenCalled();
  expect(runAgentSessionMock).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "agent-session-1" }),
    "continue",
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

运行:

```bash
pnpm --filter @actalk/inkos-studio test -- server.test.ts
```

预期: FAIL，因为当前 server 会调用 `appendBookSessionMessage` 和 `persistBookSession`。

- [ ] **Step 3: 修改 `/api/v1/agent` 主路径**

在 `packages/studio/src/api/server.ts`：

1. 删除 `initialMessages` 构造。
2. 调用 `runAgentSession(config, instruction)`，不传第三个参数。
3. 删除 “Persist user + assistant messages to BookSession” 块。
4. 成功后重新 `loadBookSession(root, bookSession.sessionId)` 获取 transcript 派生 session。
5. 如果派生 session title 从 null 变为非空，继续 `broadcast("session:title", ...)`。

核心形状：

```ts
const beforeTitle = bookSession.title;
const result = await runAgentSession(
  {
    model,
    apiKey: agentApiKey,
    pipeline,
    projectRoot: root,
    bookId: activeBookId ?? null,
    sessionId: bookSession.sessionId,
    language: config.language ?? "zh",
    onEvent: ...
  },
  instruction,
);

bookSession = await loadBookSession(root, bookSession.sessionId) ?? bookSession;
if (beforeTitle === null && bookSession.title) {
  broadcast("session:title", { sessionId: bookSession.sessionId, title: bookSession.title });
}
```

fallback plain chat 分支需要写一个 synthetic assistant response。新增 helper 从 core 导出后在 server 调用：

```ts
await appendManualSessionMessages(root, bookSession.sessionId, [
  { role: "assistant", content: [{ type: "text", text: fallback.content }], timestamp: Date.now() },
]);
bookSession = await loadBookSession(root, bookSession.sessionId) ?? bookSession;
```

在本任务把 `appendManualSessionMessages` 补到 `session-transcript.ts`：

```ts
export async function appendManualSessionMessages(projectRoot: string, sessionId: string, messages: unknown[]): Promise<void> {
  const requestId = randomUUID();
  let seq = await nextTranscriptSeq(projectRoot, sessionId);
  await appendTranscriptEvent(projectRoot, { type: "request_started", version: 1, sessionId, requestId, seq: seq++, timestamp: Date.now(), input: "" });
  let parentUuid: string | null = null;
  for (const message of messages) {
    const record = message as { role: "user" | "assistant" | "toolResult" | "system"; timestamp?: number };
    const uuid = randomUUID();
    await appendTranscriptEvent(projectRoot, { type: "message", version: 1, sessionId, requestId, uuid, parentUuid, seq: seq++, role: record.role, timestamp: record.timestamp ?? Date.now(), message: record });
    parentUuid = uuid;
  }
  await appendTranscriptEvent(projectRoot, { type: "request_committed", version: 1, sessionId, requestId, seq: seq++, timestamp: Date.now() });
}
```

- [ ] **Step 4: 运行测试确认通过**

运行:

```bash
pnpm --filter @actalk/inkos-studio test -- server.test.ts
```

预期: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/studio/src/api/server.ts packages/studio/src/api/server.test.ts packages/core/src/interaction/session-transcript.ts packages/core/src/index.ts
git commit -m "feat: derive studio agent sessions from transcript"
```

---

### Task 7: 导出 API、类型检查和回归测试

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/__tests__/book-session-store.test.ts`
- Modify: `packages/studio/src/api/server.test.ts`

- [ ] **Step 1: 写导出测试**

在 `packages/core/src/__tests__/session-transcript.test.ts` 增加从 package index 导入的 smoke test：

```ts
it("从 core index 导出 transcript helper", async () => {
  const core = await import("../index.js");
  expect(typeof core.readTranscriptEvents).toBe("function");
  expect(typeof core.restoreAgentMessagesFromTranscript).toBe("function");
});
```

- [ ] **Step 2: 修改 index exports**

在 `packages/core/src/index.ts` 增加：

```ts
export {
  appendManualSessionMessages,
  appendTranscriptEvent,
  legacyBookSessionPath,
  nextTranscriptSeq,
  readTranscriptEvents,
  sessionsDir,
  transcriptPath,
} from "./interaction/session-transcript.js";
export {
  cleanRestoredAgentMessages,
  committedMessageEvents,
  deriveBookSessionFromTranscript,
  restoreAgentMessagesFromTranscript,
} from "./interaction/session-transcript-restore.js";
export {
  MessageEventSchema,
  RequestCommittedEventSchema,
  RequestFailedEventSchema,
  RequestStartedEventSchema,
  SessionCreatedEventSchema,
  SessionMetadataUpdatedEventSchema,
  TranscriptEventSchema,
  type MessageEvent,
  type RequestCommittedEvent,
  type RequestFailedEvent,
  type RequestStartedEvent,
  type SessionCreatedEvent,
  type SessionMetadataUpdatedEvent,
  type TranscriptEvent,
} from "./interaction/session-transcript-schema.js";
```

- [ ] **Step 3: 运行 core 全量相关测试**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- session-transcript.test.ts session-transcript-restore.test.ts book-session-store.test.ts agent-session.test.ts
```

预期: PASS。

- [ ] **Step 4: 运行 typecheck**

运行:

```bash
pnpm --filter @actalk/inkos-core typecheck
pnpm --filter @actalk/inkos-studio typecheck
```

预期: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/index.ts packages/core/src/__tests__/session-transcript.test.ts
git commit -m "chore: export transcript APIs"
```

---

### Task 8: 最终验证和文档同步

**Files:**
- Modify: `docs/superpowers/specs/2026-04-27-pi-agent-jsonl-persistence-design.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 确认 SPEC 已记录 legacy display 和 fallback 补写**

确认 `docs/superpowers/specs/2026-04-27-pi-agent-jsonl-persistence-design.md` 包含以下两点：

```md
`MessageEvent.legacyDisplay` 只用于 legacy JSON 迁移后的 UI 派生，例如旧 `InteractionMessage.thinking`。它不进入模型恢复路径，避免把无 signature 的旧 thinking 伪造成可回放的 provider thinking block。

如果 Studio plain chat fallback 需要补写 assistant 文本，使用 synthetic committed request 写入 transcript。
```

- [ ] **Step 2: 运行完整相关测试**

运行:

```bash
pnpm --filter @actalk/inkos-core test -- session-transcript.test.ts session-transcript-restore.test.ts book-session-store.test.ts agent-session.test.ts
pnpm --filter @actalk/inkos-studio test -- server.test.ts
pnpm --filter @actalk/inkos-core typecheck
pnpm --filter @actalk/inkos-studio typecheck
```

预期: 全部 PASS。

- [ ] **Step 3: 检查不会继续写 legacy JSON**

运行:

```bash
rg -n "persistBookSession\\(|appendBookSessionMessage\\(" packages/studio/src/api/server.ts packages/core/src/agent packages/core/src/interaction
```

预期: `packages/studio/src/api/server.ts` 不再有 agent 成功路径对 `appendBookSessionMessage()` 或 `persistBookSession()` 的调用；`book-session-store.ts` 可以保留兼容导出。

- [ ] **Step 4: 查看 git diff**

运行:

```bash
git diff --stat
git status --short
```

预期: 只包含本计划涉及的 core、studio、测试和文档文件。

- [ ] **Step 5: 提交最终文档同步**

```bash
git add docs/superpowers/specs/2026-04-27-pi-agent-jsonl-persistence-design.md AGENTS.md
git commit -m "docs: sync transcript persistence notes"
```
