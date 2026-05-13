/**
 * 训练容量计算工具
 *
 * 计算每周训练容量（组数 × 次数 × 重量），
 * 用于评估训练负荷是否在合理范围内。
 */

export interface VolumeInput {
  /** 训练动作列表 */
  exercises: Array<{
    name: string;
    sets: number;
    reps: number;
    weight: number; // kg
    muscleGroup: string;
  }>;
}

export interface VolumeResult {
  totalVolume: number; // kg
  totalSets: number;
  byMuscleGroup: Record<string, { sets: number; volume: number }>;
  recommendation: string;
}

/** 每周每肌群推荐组数范围 */
const WEEKLY_SET_RANGES: Record<string, { min: number; max: number; optimal: number }> = {
  chest: { min: 10, max: 20, optimal: 14 },
  back: { min: 10, max: 20, optimal: 14 },
  shoulders: { min: 8, max: 16, optimal: 12 },
  biceps: { min: 6, max: 14, optimal: 10 },
  triceps: { min: 6, max: 14, optimal: 10 },
  quads: { min: 10, max: 20, optimal: 14 },
  hamstrings: { min: 8, max: 16, optimal: 12 },
  glutes: { min: 8, max: 16, optimal: 12 },
  calves: { min: 6, max: 12, optimal: 8 },
  abs: { min: 6, max: 12, optimal: 8 },
};

export function calculateVolume(input: VolumeInput): VolumeResult {
  const byMuscleGroup: Record<string, { sets: number; volume: number }> = {};
  let totalVolume = 0;
  let totalSets = 0;

  for (const ex of input.exercises) {
    const volume = ex.sets * ex.reps * ex.weight;
    totalVolume += volume;
    totalSets += ex.sets;

    const group = ex.muscleGroup.toLowerCase();
    if (!byMuscleGroup[group]) {
      byMuscleGroup[group] = { sets: 0, volume: 0 };
    }
    byMuscleGroup[group]!.sets += ex.sets;
    byMuscleGroup[group]!.volume += volume;
  }

  // 生成建议
  const issues: string[] = [];
  for (const [group, data] of Object.entries(byMuscleGroup)) {
    const range = WEEKLY_SET_RANGES[group];
    if (range) {
      if (data.sets < range.min) {
        issues.push(`${group} 组数偏低 (${data.sets}/${range.min}-${range.max})`);
      } else if (data.sets > range.max) {
        issues.push(`${group} 组数过高 (${data.sets}/${range.min}-${range.max})，注意恢复`);
      }
    }
  }

  const recommendation = issues.length > 0
    ? issues.join("；")
    : "训练容量在合理范围内";

  return { totalVolume, totalSets, byMuscleGroup, recommendation };
}
