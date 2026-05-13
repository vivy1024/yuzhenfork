/**
 * 玉珍健身插件入口
 *
 * 注册健身领域的 Agent、工具和管线到 NovelFork Studio 运行时。
 */

export { manifest } from "./manifest.js";
export { coachPrompt, safetyAssessorPrompt, nutritionPlannerPrompt } from "./prompts/index.js";
export { calculateTDEE } from "./tools/tdee.js";
export { calculateVolume } from "./tools/volume.js";
export { checkContraindications } from "./tools/safety.js";
export { runTrainingPlanPipeline, runSafetyAssessmentPipeline, runNutritionPlanPipeline } from "./pipelines/index.js";
