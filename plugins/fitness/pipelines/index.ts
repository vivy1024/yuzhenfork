/**
 * 健身管线 — 多步骤编排
 *
 * 从备份的 fitness-pipelines.ts 简化而来，
 * 适配 NovelFork 插件架构。
 */

export interface PipelineContext {
  userMessage: string;
  userProfile?: {
    weight?: number;
    height?: number;
    age?: number;
    gender?: "male" | "female";
    conditions?: string[];
    experience?: "beginner" | "intermediate" | "advanced";
    goal?: "muscle_gain" | "fat_loss" | "maintenance" | "strength";
  };
  mcpCall?: (serverName: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface PipelineResult {
  success: boolean;
  response: string;
  steps: string[];
  safetyCheck?: {
    passed: boolean;
    overallRisk: "low" | "medium" | "high";
  };
}

/**
 * 训练计划管线
 * 需求分析 → 知识检索 → 安全检查 → 计划生成
 */
export async function runTrainingPlanPipeline(_ctx: PipelineContext): Promise<PipelineResult> {
  // TODO: 实现完整管线，当前返回骨架
  return {
    success: true,
    response: "训练计划管线骨架 — 待实现",
    steps: ["需求分析", "知识检索", "安全检查", "计划生成"],
  };
}

/**
 * 安全评估管线
 * 独立执行，不受对话历史影响
 */
export async function runSafetyAssessmentPipeline(_ctx: PipelineContext): Promise<PipelineResult> {
  return {
    success: true,
    response: "安全评估管线骨架 — 待实现",
    steps: ["禁忌症匹配", "关节压力评估", "技术难度评估", "替代方案推荐"],
  };
}

/**
 * 营养规划管线
 * TDEE 计算 → 食物检索 → 饮食计划生成
 */
export async function runNutritionPlanPipeline(_ctx: PipelineContext): Promise<PipelineResult> {
  return {
    success: true,
    response: "营养规划管线骨架 — 待实现",
    steps: ["TDEE计算", "宏量营养素分配", "食物检索", "饮食计划生成"],
  };
}
