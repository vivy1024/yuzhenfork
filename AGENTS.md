# AGENTS.md

InkOS 专业 agent 设计采用渐进式披露：先读 `docs/agents/agent-extraction-guide.md`，再按需深入 `docs/agents/<AgentName>.md`。

默认使用中文回答问题，并使用中文撰写计划和 SPEC 文件。

InkOS pi-agent 持久化模块设计在 `docs/superpowers/specs/2026-04-27-pi-agent-jsonl-persistence-design.md`，需要了解 JSONL transcript、requestId、toolResult、thinking、cache 和 legacy migration 时先读该文件。

## 回答结构规范

回答技术问题时要体现清晰的思考过程，而非堆叠语义相近的描述。

1. **先抽象分类**：先把问题归纳成少数几个大类，说明每一类解决什么核心矛盾。
2. **再建立推演链路**：按“问题背景 -> 关键数据结构 -> 执行步骤 -> 结果影响”的顺序解释机制。
3. **用证据支撑判断**：涉及源码时给出关键函数、字段、调用链或文件位置，让结论可以被验证。
4. **解释因果关系**：说明某个设计为什么能产生对应结果，以及缺少这个设计会触发什么失败场景。
5. **避免空泛对比**：不要用简单二分对比替代解释；对比只能作为结论，不能作为证明过程。
6. **控制信息密度**：每一层只放支撑当前结论所需的信息，细节服务于推理，不做无目的罗列。
