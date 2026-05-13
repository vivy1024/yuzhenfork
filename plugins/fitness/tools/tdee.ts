/**
 * TDEE 计算工具
 *
 * 使用 Mifflin-St Jeor 公式计算基础代谢率（BMR），
 * 再乘以活动系数得到每日总能量消耗（TDEE）。
 */

export interface TDEEInput {
  /** 体重 kg */
  weight: number;
  /** 身高 cm */
  height: number;
  /** 年龄 */
  age: number;
  /** 性别 */
  gender: "male" | "female";
  /** 活动水平 */
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
}

export interface TDEEResult {
  bmr: number;
  tdee: number;
  activityMultiplier: number;
  formula: string;
}

const ACTIVITY_MULTIPLIERS: Record<TDEEInput["activityLevel"], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateTDEE(input: TDEEInput): TDEEResult {
  // Mifflin-St Jeor
  let bmr: number;
  if (input.gender === "male") {
    bmr = 10 * input.weight + 6.25 * input.height - 5 * input.age + 5;
  } else {
    bmr = 10 * input.weight + 6.25 * input.height - 5 * input.age - 161;
  }

  const multiplier = ACTIVITY_MULTIPLIERS[input.activityLevel];
  const tdee = Math.round(bmr * multiplier);

  return {
    bmr: Math.round(bmr),
    tdee,
    activityMultiplier: multiplier,
    formula: "Mifflin-St Jeor",
  };
}
