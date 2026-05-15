/**
 * 安全检查工具 — 禁忌症匹配
 *
 * 根据用户的伤病/疾病历史，检查训练动作是否存在禁忌。
 */

export interface ContraindicationInput {
  /** 用户伤病/疾病列表 */
  conditions: string[];
  /** 待检查的训练动作 */
  exercises: string[];
}

export interface ContraindicationResult {
  results: Array<{
    exercise: string;
    riskLevel: "safe" | "caution" | "contraindicated";
    matchedCondition?: string;
    reason: string;
    alternative?: string;
  }>;
  overallRisk: "low" | "medium" | "high";
}

/**
 * 基础禁忌症规则表（硬编码的确定性规则）
 * 复杂判断交给 LLM + DAML-RAG
 */
const CONTRAINDICATION_RULES: Array<{
  condition: string;
  exercises: string[];
  riskLevel: "caution" | "contraindicated";
  reason: string;
  alternative: string;
}> = [
  {
    condition: "腰椎间盘突出",
    exercises: ["硬拉", "深蹲", "罗马尼亚硬拉"],
    riskLevel: "contraindicated",
    reason: "轴向压缩负荷可能加重椎间盘突出",
    alternative: "腿举、保加利亚分腿蹲（轻重量）",
  },
  {
    condition: "膝关节损伤",
    exercises: ["深蹲", "腿举", "箭步蹲"],
    riskLevel: "caution",
    reason: "膝关节屈曲角度过大可能加重损伤",
    alternative: "限制屈曲角度，使用弹力带辅助",
  },
  {
    condition: "肩袖损伤",
    exercises: ["过头推举", "侧平举", "引体向上"],
    riskLevel: "contraindicated",
    reason: "肩关节外展/上举可能撕裂已损伤的肩袖",
    alternative: "地雷管推举、面拉（轻重量）",
  },
  {
    condition: "高血压",
    exercises: ["大重量深蹲", "大重量硬拉", "腿举"],
    riskLevel: "caution",
    reason: "大重量训练时血压急剧升高",
    alternative: "中等重量高次数，避免憋气",
  },
];

export function checkContraindications(input: ContraindicationInput): ContraindicationResult {
  const results: ContraindicationResult["results"] = [];

  for (const exercise of input.exercises) {
    let matched = false;

    for (const rule of CONTRAINDICATION_RULES) {
      const conditionMatch = input.conditions.some(
        (c) => c.includes(rule.condition) || rule.condition.includes(c),
      );
      const exerciseMatch = rule.exercises.some(
        (e) => exercise.includes(e) || e.includes(exercise),
      );

      if (conditionMatch && exerciseMatch) {
        results.push({
          exercise,
          riskLevel: rule.riskLevel,
          matchedCondition: rule.condition,
          reason: rule.reason,
          alternative: rule.alternative,
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      results.push({
        exercise,
        riskLevel: "safe",
        reason: "未匹配到已知禁忌症规则",
      });
    }
  }

  // 计算整体风险
  const hasContraindicated = results.some((r) => r.riskLevel === "contraindicated");
  const hasCaution = results.some((r) => r.riskLevel === "caution");
  const overallRisk = hasContraindicated ? "high" : hasCaution ? "medium" : "low";

  return { results, overallRisk };
}
