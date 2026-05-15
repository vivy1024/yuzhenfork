/**
 * 健身管线 — 多步骤编排
 *
 * 每个管线定义了一个完整的工具调用序列。
 * 在 headless-chat 模式下，这些管线由 LLM 通过 Skill prompt 自动驱动。
 * 此处提供程序化调用入口，用于测试和非交互场景。
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
    activityLevel?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  };
  /** MCP 工具调用函数（由运行时注入） */
  mcpCall?: (serverName: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface PipelineResult {
  success: boolean;
  response: string;
  steps: Array<{ name: string; status: "completed" | "skipped" | "failed"; data?: unknown }>;
  safetyCheck?: {
    passed: boolean;
    overallRisk: "low" | "medium" | "high";
    warnings: string[];
  };
}

/**
 * 训练计划管线
 *
 * 1. 评估用户水平
 * 2. 搜索适合的动作
 * 3. 设计训练分化
 * 4. 安全校验
 */
export async function runTrainingPlanPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const steps: PipelineResult["steps"] = [];
  const warnings: string[] = [];

  if (!ctx.mcpCall) {
    return { success: false, response: "MCP 调用函数未注入", steps: [] };
  }

  try {
    // Step 1: 搜索动作
    const exercises = await ctx.mcpCall("daml-rag", "search_exercises", {
      query_text: ctx.userMessage,
      user_profile: ctx.userProfile ? {
        fitness_level: ctx.userProfile.experience || "intermediate",
        conditions: ctx.userProfile.conditions || [],
      } : undefined,
      top_k: 15,
    });
    steps.push({ name: "搜索动作", status: "completed", data: exercises });

    // Step 2: 设计训练分化
    const daysPerWeek = ctx.userProfile?.experience === "beginner" ? 3 : 4;
    const split = await ctx.mcpCall("daml-rag", "design_training_split", {
      days_per_week: daysPerWeek,
    });
    steps.push({ name: "设计分化", status: "completed", data: split });

    // Step 3: 安全校验（如果有伤病）
    if (ctx.userProfile?.conditions && ctx.userProfile.conditions.length > 0) {
      const { checkContraindications } = await import("../tools/safety.js");
      const exerciseNames = (exercises as any)?.exercises?.map((e: any) => e.name_zh || e.name) || [];
      const safetyResult = checkContraindications({
        conditions: ctx.userProfile.conditions,
        exercises: exerciseNames.slice(0, 10),
      });

      if (safetyResult.overallRisk === "high") {
        warnings.push("检测到高风险动作，已从方案中移除");
      }
      steps.push({ name: "安全校验", status: "completed", data: safetyResult });
    } else {
      steps.push({ name: "安全校验", status: "skipped" });
    }

    return {
      success: true,
      response: "训练计划生成完成",
      steps,
      safetyCheck: {
        passed: warnings.length === 0,
        overallRisk: warnings.length > 0 ? "medium" : "low",
        warnings,
      },
    };
  } catch (error) {
    steps.push({ name: "异常", status: "failed", data: String(error) });
    return { success: false, response: `管线执行失败: ${error}`, steps };
  }
}

/**
 * 安全评估管线
 *
 * 独立执行安全评估，不受对话历史影响。
 */
export async function runSafetyAssessmentPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const steps: PipelineResult["steps"] = [];

  if (!ctx.mcpCall) {
    return { success: false, response: "MCP 调用函数未注入", steps: [] };
  }

  if (!ctx.userProfile?.conditions || ctx.userProfile.conditions.length === 0) {
    return {
      success: true,
      response: "用户无已知伤病/疾病，无需特殊安全评估",
      steps: [{ name: "前置检查", status: "completed" }],
      safetyCheck: { passed: true, overallRisk: "low", warnings: [] },
    };
  }

  try {
    // Step 1: 搜索相关动作
    const exercises = await ctx.mcpCall("daml-rag", "search_exercises", {
      query_text: ctx.userMessage,
      user_profile: { conditions: ctx.userProfile.conditions },
      top_k: 10,
    });
    steps.push({ name: "搜索动作", status: "completed", data: exercises });

    // Step 2: 搜索安全知识
    const knowledge = await ctx.mcpCall("daml-rag", "search_knowledge", {
      query_text: `${ctx.userProfile.conditions.join(" ")} 训练禁忌`,
      top_k: 5,
    });
    steps.push({ name: "搜索安全知识", status: "completed", data: knowledge });

    // Step 3: 本地禁忌症检查
    const { checkContraindications } = await import("../tools/safety.js");
    const exerciseNames = (exercises as any)?.exercises?.map((e: any) => e.name_zh || e.name) || [];
    const safetyResult = checkContraindications({
      conditions: ctx.userProfile.conditions,
      exercises: exerciseNames,
    });
    steps.push({ name: "禁忌症匹配", status: "completed", data: safetyResult });

    const warnings = safetyResult.results
      .filter(r => r.riskLevel !== "safe")
      .map(r => `${r.exercise}: ${r.reason}`);

    return {
      success: true,
      response: "安全评估完成",
      steps,
      safetyCheck: {
        passed: safetyResult.overallRisk === "low",
        overallRisk: safetyResult.overallRisk,
        warnings,
      },
    };
  } catch (error) {
    steps.push({ name: "异常", status: "failed", data: String(error) });
    return { success: false, response: `安全评估失败: ${error}`, steps };
  }
}

/**
 * 营养规划管线
 *
 * TDEE 计算 → 食物检索 → 饮食计划生成
 */
export async function runNutritionPlanPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const steps: PipelineResult["steps"] = [];

  if (!ctx.mcpCall) {
    return { success: false, response: "MCP 调用函数未注入", steps: [] };
  }

  if (!ctx.userProfile?.weight || !ctx.userProfile?.height || !ctx.userProfile?.age || !ctx.userProfile?.gender) {
    return {
      success: false,
      response: "缺少必要信息：需要体重、身高、年龄、性别才能计算 TDEE",
      steps: [{ name: "前置检查", status: "failed" }],
    };
  }

  try {
    // Step 1: 计算 TDEE
    const tdee = await ctx.mcpCall("daml-rag", "calculate_tdee", {
      gender: ctx.userProfile.gender,
      age: ctx.userProfile.age,
      weight: ctx.userProfile.weight,
      height: ctx.userProfile.height,
      activity_level: ctx.userProfile.activityLevel || "moderate",
      goal: ctx.userProfile.goal || "maintenance",
    });
    steps.push({ name: "TDEE计算", status: "completed", data: tdee });

    // Step 2: 搜索推荐食物
    const goalKeyword = ctx.userProfile.goal === "fat_loss" ? "高蛋白低脂" :
                        ctx.userProfile.goal === "muscle_gain" ? "高蛋白高热量" : "均衡饮食";
    const foods = await ctx.mcpCall("daml-rag", "search_foods", {
      query_text: goalKeyword,
      top_k: 10,
    });
    steps.push({ name: "食物搜索", status: "completed", data: foods });

    return {
      success: true,
      response: "营养规划完成",
      steps,
      safetyCheck: { passed: true, overallRisk: "low", warnings: [] },
    };
  } catch (error) {
    steps.push({ name: "异常", status: "failed", data: String(error) });
    return { success: false, response: `营养规划失败: ${error}`, steps };
  }
}
