import type { PluginManifest, PluginToolDefinition, PluginPromptExtension } from "@vivy1024/novelfork-core";
import { SKILL_DEFINITIONS } from "./skills/definitions.js";

// Re-export for consumers
export { SKILL_DEFINITIONS } from "./skills/definitions.js";
export type { SkillDefinition } from "./skills/definitions.js";
export { calculateTDEE } from "./tools/tdee.js";
export { calculateVolume } from "./tools/volume.js";
export { assessSafety } from "./tools/safety.js";

/**
 * 健身插件工具定义
 */
const FITNESS_TOOLS: PluginToolDefinition[] = [
  {
    name: "fitness.calculate_tdee",
    description: "计算每日总能量消耗（TDEE）— 基于 Mifflin-St Jeor 公式",
    inputSchema: {
      type: "object",
      properties: {
        weight: { type: "number", description: "体重 (kg)" },
        height: { type: "number", description: "身高 (cm)" },
        age: { type: "number", description: "年龄" },
        gender: { type: "string", enum: ["male", "female"] },
        activityLevel: { type: "string", enum: ["sedentary", "light", "moderate", "active", "very_active"] },
      },
      required: ["weight", "height", "age", "gender", "activityLevel"],
    },
    scope: "fitness",
  },
  {
    name: "fitness.calculate_volume",
    description: "计算训练容量建议（MEV/MAV/MRV）",
    inputSchema: {
      type: "object",
      properties: {
        muscleGroup: { type: "string", description: "目标肌群" },
        trainingLevel: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
        goal: { type: "string", enum: ["strength", "hypertrophy", "endurance"] },
      },
      required: ["muscleGroup", "trainingLevel"],
    },
    scope: "fitness",
  },
  {
    name: "fitness.assess_safety",
    description: "评估训练安全性 — 检查禁忌症和风险",
    inputSchema: {
      type: "object",
      properties: {
        exercises: { type: "array", items: { type: "string" }, description: "计划中的动作列表" },
        injuries: { type: "array", items: { type: "string" }, description: "用户已有伤病" },
        conditions: { type: "array", items: { type: "string" }, description: "健康状况" },
      },
      required: ["exercises"],
    },
    scope: "fitness",
    risk: "medium",
  },
];

/**
 * 健身插件 System Prompt 扩展
 */
const FITNESS_PROMPT_EXTENSIONS: PluginPromptExtension[] = [
  {
    position: "after",
    content: `你是玉珍健身 AI 教练，使用 Skills-first 方法论。
你有 ${SKILL_DEFINITIONS.length} 个核心 Skill，根据用户意图自动选择合适的 Skill 执行。
安全第一：任何涉及伤病/禁忌的场景必须先调用安全评估工具。`,
    condition: { projectType: "fitness" },
  },
];

/**
 * 玉珍健身插件 Manifest
 */
export const FITNESS_PLUGIN_MANIFEST: PluginManifest = {
  id: "yuzhenfork-fitness",
  name: "yuzhenfork-fitness",
  displayName: "玉珍健身插件",
  version: "0.6.0",
  description: "Skills-first 健身 AI Agent — 10 个核心 Skill + MCP 工具链 + 安全 Harness",
  author: "薛小川",
  homepage: "https://github.com/vivy1024/yuzhenfork",
  projectType: "fitness",
  tools: FITNESS_TOOLS,
  agentPresets: [
    {
      agentId: "fitness-coach",
      name: "健身教练",
      tools: FITNESS_TOOLS.map(t => t.name),
      systemPromptSuffix: "你是专业的健身教练，基于运动科学共识提供建议。",
    },
  ],
  routes: [],
  systemPromptExtensions: FITNESS_PROMPT_EXTENSIONS,
};

export default FITNESS_PLUGIN_MANIFEST;
