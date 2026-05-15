import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPrompt(filename: string): string {
  return readFileSync(resolve(__dirname, filename), "utf-8");
}

export const coachPrompt = loadPrompt("coach.md");
export const safetyAssessorPrompt = loadPrompt("safety-assessor.md");
export const nutritionPlannerPrompt = loadPrompt("nutrition-planner.md");
