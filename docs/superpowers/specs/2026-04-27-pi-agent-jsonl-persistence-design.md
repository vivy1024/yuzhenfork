# InkOS Pi-Agent JSONL 持久化设计

状态：已确认进入 SPEC
日期：2026-04-27

## 1. 目标

InkOS pi-agent session 持久化收敛为一层：追加式 JSONL transcript，路径为 `.inkos/sessions/{sessionId}.jsonl`。

transcript 是 agent 历史的唯一持久事实源。UI session 对象、聊天消息、thinking 展示、工具执行面板、session 列表摘要、恢复后的 `Agent.state.messages` 都从 transcript 派生。

这个设计替换当前两层行为：`BookSession` JSON 持久化 UI 形状的消息，`agentCache` 在短时间内保存更完整的内存态 `AgentMessage` 历史。

## 2. 源码对齐

### 2.1 Claude Code Main

Claude Code 用 JSONL transcript entry 存储对话历史。恢复主链围绕 `uuid`、`parentUuid`、`sessionId` 展开，没有把 transcript 级 `turnId` 作为恢复主结构。

关键源码位置：

- `/Users/fanghanjun/claude-code-main/src/types/logs.ts`：`SerializedMessage` 携带 `sessionId`、`timestamp`、`version`、`cwd` 等元数据。
- `/Users/fanghanjun/claude-code-main/src/types/logs.ts`：`TranscriptMessage` 增加 `parentUuid`、`isSidechain` 等图结构字段。
- `/Users/fanghanjun/claude-code-main/src/utils/sessionStorage.ts`：`insertMessageChain()` 写入消息并分配 `parentUuid`。
- `/Users/fanghanjun/claude-code-main/src/utils/sessionStorage.ts`：tool result 通过 `sourceToolAssistantUUID` 绑定到发出 tool use 的 assistant message。
- `/Users/fanghanjun/claude-code-main/src/utils/sessionStorage.ts`：`buildConversationChain()` 从 leaf message 沿 `parentUuid` 回溯恢复主链。
- `/Users/fanghanjun/claude-code-main/src/utils/sessionStorage.ts`：`recoverOrphanedParallelToolResults()` 修复并行工具调用导致的 sibling assistant/tool-result 分支遗漏。

Claude Code 在 query 和 compact tracking 中有 `turnId`，但 transcript 恢复不依赖它。InkOS 应采用同类结构：用图字段和顺序字段支撑持久恢复，用 request 级标识做分组和诊断。

### 2.2 pi-agent-core

pi-agent-core 有内部 `turn_start` / `turn_end` 事件。这个 turn 边界表示一次 assistant response cycle，粒度小于一次用户请求。

一次 `agent.prompt()` 可以包含多个 pi-agent turn：

1. user prompt 进入 `currentContext.messages`。
2. assistant 生成 `toolCall`。
3. 工具执行返回 `toolResult` message。
4. `toolResult` 被 push 进 `currentContext.messages`。
5. 下一次 assistant response 带着 tool result 继续运行。

关键源码位置：

- `node_modules/.../@mariozechner/pi-agent-core/dist/agent-loop.js`：`runAgentLoop()` 构造 `currentContext.messages = [...context.messages, ...prompts]`。
- `node_modules/.../@mariozechner/pi-agent-core/dist/agent-loop.js`：`runLoop()` 围绕每次 assistant response cycle 发出 `turn_start` 和 `turn_end`。
- `node_modules/.../@mariozechner/pi-agent-core/dist/agent-loop.js`：`emitToolCallOutcome()` 构造 `role: "toolResult"` message。
- `node_modules/.../@mariozechner/pi-agent-core/dist/agent.js`：`processEvents()` 在每个 `message_end` 时把 message push 到 `Agent.state.messages`。

InkOS 外层用户请求字段命名为 `requestId`。这样可以让 pi-agent-core 的内部 turn 语义继续保留给 `piTurnIndex`。

## 3. 核心决策

1. 使用 JSONL，一行一个事件。
2. 使用 `.inkos/sessions/{sessionId}.jsonl` 作为 canonical path。
3. 保留 `.inkos/sessions/{sessionId}.json` 的 legacy 读取能力。
4. 新 session 和已迁移 session 停止写完整 `BookSession` JSON。
5. 持久化原始 `AgentMessage`，避免写入压平后的 UI message。
6. 使用 `requestId` 表示一次 InkOS 用户请求。
7. 使用可选 `piTurnIndex` 表示 pi-agent-core 内部 turn 分组。
8. 使用 `uuid`、`parentUuid`、`seq` 支撑持久排序和未来图恢复。
9. 使用 `request_committed` 作为恢复栅栏。
10. UI 状态从 transcript event 派生，不单独持久化 `UiMessageEvent`。

## 4. 事件模型

### 4.1 事件联合类型

```ts
type TranscriptEvent =
  | SessionCreatedEvent
  | SessionMetadataUpdatedEvent
  | RequestStartedEvent
  | MessageEvent
  | RequestCommittedEvent
  | RequestFailedEvent
```

### 4.2 消息事件

```ts
type MessageEvent = {
  type: "message"
  version: 1

  sessionId: string
  requestId: string

  uuid: string
  parentUuid: string | null
  seq: number

  role: "user" | "assistant" | "toolResult" | "system"
  timestamp: number

  piTurnIndex?: number
  toolCallId?: string
  sourceToolAssistantUuid?: string

  message: AgentMessage
}
```

`message` 必须保留 pi-agent-core 原始 `AgentMessage`。assistant 的 `thinking`、`text`、`toolCall` content block，以及 `toolResult.content`、`toolResult.details`、`toolResult.isError` 都必须完整写入。

### 4.3 请求事件

```ts
type RequestStartedEvent = {
  type: "request_started"
  version: 1
  sessionId: string
  requestId: string
  seq: number
  timestamp: number
  input: string
}

type RequestCommittedEvent = {
  type: "request_committed"
  version: 1
  sessionId: string
  requestId: string
  seq: number
  timestamp: number
}

type RequestFailedEvent = {
  type: "request_failed"
  version: 1
  sessionId: string
  requestId: string
  seq: number
  timestamp: number
  error: string
}
```

`request_committed` 是恢复时使用的 durable boundary。`request_started` 后面的 message event 只有在匹配的 `request_committed` 存在时才进入模型恢复。

## 5. 写入路径

写入路径在 `runAgentSession()` 内订阅 pi-agent-core event。

每次 `/api/v1/agent` 请求执行以下步骤：

1. 分配 `requestId`。
2. append `request_started`。
3. 执行 `agent.prompt(instruction)`。
4. 每次收到 pi-agent-core `message_end` 时 append 一个 `message` event。
5. 根据 pi-agent-core `turn_start` / `turn_end` 在内存中维护 `piTurnIndex`。
6. `agent.prompt()` 正常结束后 append `request_committed`。
7. 执行失败或中断时 append `request_failed`。

带工具调用的请求会形成这类事件序列：

```text
request_started
message(user)
message(assistant: thinking + toolCall)
message(toolResult)
message(assistant: thinking + text)
request_committed
```

writer 必须按 session 串行化 append。第一版使用进程内 per-session queue 即可满足 Studio 单 Node 进程模型。每次 append 写入一个 JSON object，再写入 `\n`。

## 6. 恢复路径

恢复路径从 JSONL transcript 构造 `Agent.state.messages`。

算法：

1. 读取 `.inkos/sessions/{sessionId}.jsonl`。
2. 按文件顺序解析合法 JSONL event。
3. 构造已 committed 的 `requestId` 集合。
4. 收集 `requestId` 已 committed 的 `message` event。
5. 按 `seq` 排序。
6. 执行模型合法性清理。
7. 返回 `messageEvent.message[]`。
8. 在 `agent.prompt()` 前赋值给 `agent.state.messages`。

第一版使用 committed `seq` 顺序恢复。schema 同时写入 `uuid`、`parentUuid`、`toolCallId`、`sourceToolAssistantUuid`，后续可以增加 Claude Code 风格 leaf recovery，文件格式无需迁移。

## 7. thinking 持久化

thinking 必须作为 assistant 原始 content 持久化，不能只存 UI 字符串。

正确 transcript 数据形状：

```ts
{
  role: "assistant",
  content: [
    { type: "thinking", thinking: "...", signature: "..." },
    { type: "text", text: "..." }
  ]
}
```

UI thinking 面板从 assistant thinking block 派生。

模型恢复使用合法性清理后的原始 assistant message。清理需要覆盖：

1. 丢弃没有有效 sibling assistant content 的孤立 thinking-only assistant message。
2. 当 provider 拒绝以 thinking 结尾的 history 时，从最后一条 assistant message 移除 trailing thinking block。
3. 当 model/provider/auth fallback 使 signature 失效时，移除带 signature 的 thinking block。

legacy `.json` session 可能有 `InteractionMessage.thinking`，但该字符串没有 provider signature。迁移可以保留它用于 UI 展示，不能把它伪造成可回放给模型的 signed thinking block。

## 8. tool result 持久化

tool result 必须作为一等 `message` event 进入 transcript。

当前 InkOS 信息损耗点在 `agentMessagesToPlain()`：它跳过 `ToolResult` message。这个行为导致两种上下文结果：

1. cache 存活时，模型能看到之前的 tool result，因为 `Agent.state.messages` 仍在内存中。
2. cache 过期或进程重启后，模型只能看到压平后的 user/assistant 文本。

JSONL transcript 通过持久化原始 message 消除这种差异。恢复后的 `Agent.state.messages` 包含 committed request 结束时内存中存在的 user、assistant、toolResult message。

`sourceToolAssistantUuid` 在可获得时指向发出对应 tool call 的 assistant message。后续图恢复可以借此把 tool result 绑定到来源 tool use，降低对顺序恢复的依赖。

## 9. 缓存角色

`agentCache` 保留为加速层，不承担持久化职责。

缓存值调整为：

```ts
type CachedAgent = {
  agent: Agent
  bookId: string | null
  modelId: string | null
  lastCommittedSeq: number
  lastActive: number
}
```

复用条件：

1. `sessionId` 匹配。
2. `bookId` 匹配。
3. `modelId` 匹配。
4. transcript 最新 committed seq 等于 `lastCommittedSeq`。

任一条件不满足时，从 JSONL 重建 Agent。cache eviction 不会丢上下文，因为 JSONL 是持久事实源。

## 10. UI 派生

不引入独立的 `AgentMessageEvent | UiMessageEvent` 双事件线。

UI 状态从 transcript event 派生：

- user chat bubble：`message.role === "user"`。
- assistant chat bubble：assistant text block。
- thinking display：assistant thinking block。
- tool execution panel：assistant toolCall block 按 `toolCallId` 关联 `toolResult`。
- title：第一条 user message 或 `session_metadata_updated`。
- book binding：`session_created` 和 `session_metadata_updated`。
- session list summary：最后一条可见 user/assistant 文本与 metadata。

纯 `toolResult` message 不作为独立 user message 展示。它服务于工具执行面板和模型恢复。

## 11. 旧数据兼容

现有 `.inkos/sessions/{sessionId}.json` 文件作为 legacy session 读取。

迁移行为：

1. JSONL 存在时优先读取 JSONL。
2. 只有 JSON 存在时，读取 legacy `BookSession`。
3. 把 legacy user/assistant message 转成 transcript `message` event。
4. 把生成的 request 标记为 committed。
5. 保留 `sessionId`、`bookId`、`title`、`createdAt`、`updatedAt` 等 metadata。
6. 保留 legacy assistant `thinking` 给 UI 展示。
7. 不生成 legacy 数据里不存在的 tool result、tool call、signed thinking。
8. 迁移成功后，运行时只写 JSONL。

旧 JSON 文件可以继续留在磁盘上。迁移后它不再被更新。

## 12. 错误处理

格式错误的 JSONL 行不能导致 session 加载失败。reader 记录 warning 并跳过不可解析行。

缺少 `request_committed` 的 request 被视为 interrupted tail：

- 不进入模型恢复。
- 保留给诊断。
- 后续可以在 UI 中展示为 interrupted request。

如果最后一条 committed message 让模型 history 处于非法状态，恢复前执行清理。第一版清理 unresolved tool use、孤立 tool result、孤立 thinking-only message、空 assistant message、trailing thinking。

## 13. 测试策略

这个改动必须用 TDD。核心风险是重启、cache 过期、工具调用循环后发生静默上下文丢失。

测试分层：

1. JSONL codec 单测
   - 一行 append 一个 event。
   - 保留原始 `AgentMessage` 内的未知字段。
   - 拒绝非法 schema 形状。
   - 分配单调递增 `seq`。

2. restore 单测
   - 只恢复 committed request。
   - 忽略 interrupted tail。
   - 保留 user、assistant、toolResult 顺序。
   - 返回原始 `AgentMessage[]`。

3. thinking 单测
   - 保留 assistant thinking text。
   - 保留 provider signature 字段。
   - 不把 legacy UI thinking 转成 signed model thinking。
   - 过滤非法 trailing thinking 或孤立 thinking。

4. tool loop 单测
   - 持久化 `assistant(toolCall) -> toolResult -> assistant(text)`。
   - 恢复 toolResult 到 `Agent.state.messages`。
   - 通过 `toolCallId` 绑定 toolResult 和 toolCall。

5. legacy migration 单测
   - 读取旧 BookSession JSON。
   - 派生 UI 兼容 message。
   - 迁移后写入 JSONL。
   - 停止写 legacy JSON。

6. cache 单测
   - 最新 committed seq 匹配时复用 cache。
   - cache 落后时从 JSONL 重建。
   - book 或 model 变化时重建。

7. API 集成测试
   - `/api/v1/agent` 写 transcript event。
   - session list/detail API 从 JSONL 派生。
   - 前端响应形状保持兼容。

## 14. 实现边界

预期 core 模块：

- `packages/core/src/interaction/session-transcript.ts`
- `packages/core/src/interaction/session-transcript-schema.ts`
- `packages/core/src/interaction/session-transcript-restore.ts`
- `packages/core/src/interaction/session-transcript-legacy.ts`

预期集成点：

- `packages/core/src/agent/agent-session.ts`
- `packages/core/src/interaction/book-session-store.ts`
- `packages/studio/src/api/server.ts`

第一版不实现 compaction、branching UI、remote sync、完整 Claude Code graph recovery。schema 预留后续能力所需字段。

## 15. 验收标准

1. 新 session 写入 `.inkos/sessions/{sessionId}.jsonl`。
2. 已迁移或新建 session 不再写 `.inkos/sessions/{sessionId}.json`。
3. Studio 重启后能恢复包含 tool result 的原始 `AgentMessage[]`。
4. assistant thinking block 经过 JSONL 写入和恢复后仍然存在。
5. legacy JSON session 仍然可以加载和展示。
6. cache 过期不会改变模型可见的 conversation context。
7. 测试覆盖 committed restore、interrupted tail 排除、tool result 恢复、thinking 持久化、legacy migration、cache invalidation。
