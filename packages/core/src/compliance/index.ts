/**
 * Compliance module stub — novel-plugin 依赖此模块但健身场景不需要。
 * 提供空实现避免导入错误。
 */

export interface ComplianceScanResult {
  passed: boolean;
  issues: string[];
}

export interface AiRatioResult {
  ratio: number;
  humanWords: number;
  aiWords: number;
}

export async function scanSensitiveContent(_text: string): Promise<ComplianceScanResult> {
  return { passed: true, issues: [] };
}

export async function calculateAiRatio(_text: string): Promise<AiRatioResult> {
  return { ratio: 0, humanWords: 0, aiWords: 0 };
}
