import {
  CADENCE_PRESSURE_THRESHOLDS,
  CADENCE_WINDOW_DEFAULTS,
  resolveCadencePressure,
} from "./cadence-policy.js";

export interface CadenceSummaryRow {
  readonly chapter: number;
  readonly title: string;
  readonly mood: string;
  readonly chapterType: string;
}

export interface SceneCadencePressure {
  readonly pressure: "medium" | "high";
  readonly repeatedType: string;
  readonly streak: number;
}

export interface MoodCadencePressure {
  readonly pressure: "medium" | "high";
  readonly highTensionStreak: number;
  readonly recentMoods: ReadonlyArray<string>;
}

export interface TitleCadencePressure {
  readonly pressure: "medium" | "high";
  readonly repeatedToken: string;
  readonly count: number;
  readonly recentTitles: ReadonlyArray<string>;
}

export interface ChapterCadenceAnalysis {
  readonly scenePressure?: SceneCadencePressure;
  readonly moodPressure?: MoodCadencePressure;
  readonly titlePressure?: TitleCadencePressure;
}

export const DEFAULT_CHAPTER_CADENCE_WINDOW = CADENCE_WINDOW_DEFAULTS.summaryLookback;

const HIGH_TENSION_KEYWORDS = [
  "紧张", "冷硬", "压抑", "逼仄", "肃杀", "沉重", "凝重",
  "冷峻", "压迫", "阴沉", "焦灼", "窒息", "凛冽", "锋利",
  "克制", "危机", "对峙", "绷紧", "僵持", "杀意",
  "tense", "cold", "oppressive", "grim", "ominous", "dark",
  "bleak", "hostile", "threatening", "heavy", "suffocating",
];

const ENGLISH_STOP_WORDS = new Set([
  "the", "and", "with", "from", "into", "after", "before",
  "over", "under", "this", "that", "your", "their",
]);

export function analyzeChapterCadence(params: {
  readonly rows: ReadonlyArray<CadenceSummaryRow>;
  readonly language: "zh" | "en";
}): ChapterCadenceAnalysis {
  const recentRows = [...params.rows]
    .sort((left, right) => left.chapter - right.chapter)
    .slice(-CADENCE_WINDOW_DEFAULTS.summaryLookback);

  return {
    scenePressure: analyzeScenePressure(recentRows),
    moodPressure: analyzeMoodPressure(recentRows),
    titlePressure: analyzeTitlePressure(recentRows, params.language),
  };
}

export function isHighTensionMood(mood: string): boolean {
  const lowerMood = mood.toLowerCase();
  return HIGH_TENSION_KEYWORDS.some((keyword) => lowerMood.includes(keyword));
}

function analyzeScenePressure(
  rows: ReadonlyArray<CadenceSummaryRow>,
): SceneCadencePressure | undefined {
  const types = rows
    .map((row) => row.chapterType.trim())
    .filter((value) => isMeaningfulValue(value));
  if (types.length < 2) {
    return undefined;
  }

  const repeatedType = types.at(-1);
  if (!repeatedType) {
    return undefined;
  }

  let streak = 0;
  for (const type of [...types].reverse()) {
    if (type.toLowerCase() !== repeatedType.toLowerCase()) {
      break;
    }
    streak += 1;
  }

  const pressure = resolveCadencePressure({
    count: streak,
    total: types.length,
    highThreshold: CADENCE_PRESSURE_THRESHOLDS.scene.highCount,
    mediumThreshold: CADENCE_PRESSURE_THRESHOLDS.scene.mediumCount,
    mediumWindowFloor: CADENCE_PRESSURE_THRESHOLDS.scene.mediumWindowFloor,
  });
  if (pressure) {
    return { pressure, repeatedType, streak };
  }
  return undefined;
}

function analyzeMoodPressure(
  rows: ReadonlyArray<CadenceSummaryRow>,
): MoodCadencePressure | undefined {
  const moods = rows
    .map((row) => row.mood.trim())
    .filter((value) => isMeaningfulValue(value));
  if (moods.length < 2) {
    return undefined;
  }

  const recentMoods: string[] = [];
  let highTensionStreak = 0;
  for (const mood of [...moods].reverse()) {
    if (!isHighTensionMood(mood)) {
      break;
    }
    recentMoods.unshift(mood);
    highTensionStreak += 1;
  }

  const pressure = resolveCadencePressure({
    count: highTensionStreak,
    total: moods.length,
    highThreshold: CADENCE_PRESSURE_THRESHOLDS.mood.highCount,
    mediumThreshold: CADENCE_PRESSURE_THRESHOLDS.mood.mediumCount,
    mediumWindowFloor: CADENCE_PRESSURE_THRESHOLDS.mood.mediumWindowFloor,
  });
  if (pressure) {
    return { pressure, highTensionStreak, recentMoods };
  }
  return undefined;
}

function analyzeTitlePressure(
  rows: ReadonlyArray<CadenceSummaryRow>,
  language: "zh" | "en",
): TitleCadencePressure | undefined {
  const titles = rows
    .map((row) => row.title.trim())
    .filter((value) => isMeaningfulValue(value));
  if (titles.length < 2) {
    return undefined;
  }

  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const token of extractTitleTokens(title, language)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  const repeated = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))
    .find((entry) => entry[1] >= CADENCE_PRESSURE_THRESHOLDS.title.minimumRepeatedCount);
  if (!repeated) {
    return undefined;
  }

  const [repeatedToken, count] = repeated;
  const pressure = resolveCadencePressure({
    count,
    total: titles.length,
    highThreshold: CADENCE_PRESSURE_THRESHOLDS.title.highCount,
    mediumThreshold: CADENCE_PRESSURE_THRESHOLDS.title.mediumCount,
    mediumWindowFloor: CADENCE_PRESSURE_THRESHOLDS.title.mediumWindowFloor,
  });
  if (pressure) {
    return { pressure, repeatedToken, count, recentTitles: titles };
  }
  return undefined;
}

function extractTitleTokens(title: string, language: "zh" | "en"): string[] {
  if (language === "en") {
    const words = title.match(/[a-z]{4,}/gi) ?? [];
    return [...new Set(
      words
        .map((word) => word.toLowerCase())
        .filter((word) => !ENGLISH_STOP_WORDS.has(word)),
    )];
  }

  const segments = title.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const tokens = new Set<string>();
  for (const segment of segments) {
    for (let size = 2; size <= Math.min(4, segment.length); size += 1) {
      for (let index = 0; index <= segment.length - size; index += 1) {
        tokens.add(segment.slice(index, index + size));
      }
    }
  }

  return [...tokens];
}

// ── Objective Cycle Analysis ────────────────────────────────────

export interface ObjectiveCycleAnalysis {
  readonly phase: "蓄压" | "升级" | "爆发" | "后效";
  readonly reasoning: string;
  readonly chaptersInCurrentPhase: number;
  readonly payoffDue: boolean;
  readonly hookDebtLevel: "low" | "medium" | "high";
}

const CLIMAX_TYPES = new Set([
  "爽点", "爆发", "payoff", "climax", "knife-twist", "刀子",
]);

const SETUP_TYPES = new Set([
  "调查", "铺垫", "推进", "过渡", "investigation", "setup",
  "progression", "transition",
]);

const ESCALATION_TYPES = new Set([
  "冲突", "反转", "conflict", "reversal", "reveal", "揭露",
]);

const AFTERMATH_TYPES = new Set([
  "后效", "收束", "aftermath", "resolution", "denouement",
]);

function classifyChapterType(chapterType: string): "setup" | "escalation" | "climax" | "aftermath" | "unknown" {
  const lower = chapterType.toLowerCase().trim();
  if (CLIMAX_TYPES.has(lower)) return "climax";
  if (AFTERMATH_TYPES.has(lower)) return "aftermath";
  if (ESCALATION_TYPES.has(lower)) return "escalation";
  if (SETUP_TYPES.has(lower)) return "setup";
  // Partial matching for compound types like "调查章"
  for (const keyword of CLIMAX_TYPES) {
    if (lower.includes(keyword)) return "climax";
  }
  for (const keyword of AFTERMATH_TYPES) {
    if (lower.includes(keyword)) return "aftermath";
  }
  for (const keyword of ESCALATION_TYPES) {
    if (lower.includes(keyword)) return "escalation";
  }
  for (const keyword of SETUP_TYPES) {
    if (lower.includes(keyword)) return "setup";
  }
  return "unknown";
}

function mapClassToPhase(cls: "setup" | "escalation" | "climax" | "aftermath" | "unknown"): "蓄压" | "升级" | "爆发" | "后效" {
  switch (cls) {
    case "setup": return "蓄压";
    case "escalation": return "升级";
    case "climax": return "爆发";
    case "aftermath": return "后效";
    case "unknown": return "蓄压";
  }
}

function computeHookDebtLevel(staleDebt: ReadonlyArray<string>): "low" | "medium" | "high" {
  if (staleDebt.length >= 3) return "high";
  if (staleDebt.length >= 1) return "medium";
  return "low";
}

export function analyzeObjectiveCycle(params: {
  readonly rows: ReadonlyArray<CadenceSummaryRow>;
  readonly hookAgenda: {
    readonly eligibleResolve: ReadonlyArray<string>;
    readonly staleDebt: ReadonlyArray<string>;
  };
  readonly language: "zh" | "en";
}): ObjectiveCycleAnalysis {
  const recentRows = [...params.rows]
    .sort((left, right) => left.chapter - right.chapter)
    .slice(-5);

  const payoffDue = params.hookAgenda.eligibleResolve.length > 0;
  const hookDebtLevel = computeHookDebtLevel(params.hookAgenda.staleDebt);

  if (recentRows.length === 0) {
    return {
      phase: "蓄压",
      reasoning: params.language === "en"
        ? "No prior chapters — starting with pressure-building."
        : "无前章记录——从蓄压开始。",
      chaptersInCurrentPhase: 0,
      payoffDue,
      hookDebtLevel,
    };
  }

  const classifications = recentRows.map((row) => classifyChapterType(row.chapterType));
  const lastClassification = classifications.at(-1) ?? "unknown";

  // Count consecutive chapters in the same classification (from the end)
  let consecutiveCount = 0;
  for (let i = classifications.length - 1; i >= 0; i--) {
    if (classifications[i] === lastClassification) {
      consecutiveCount += 1;
    } else {
      break;
    }
  }

  // Determine the phase for the NEXT chapter
  let phase: "蓄压" | "升级" | "爆发" | "后效";
  let reasoning: string;
  const isEn = params.language === "en";

  // Rule 1: If last chapter was climax → aftermath
  if (lastClassification === "climax") {
    phase = "后效";
    reasoning = isEn
      ? "Previous chapter was a climax — write the aftermath: changed relationships, costs, new status."
      : "上一章是爆发——本章写后效：关系变了、代价显现、新状态。";
  }
  // Rule 2: If stale debt is high → force toward climax
  else if (hookDebtLevel === "high") {
    phase = "爆发";
    reasoning = isEn
      ? `High hook debt (${params.hookAgenda.staleDebt.length} stale) — force a payoff chapter.`
      : `伏笔积压严重（${params.hookAgenda.staleDebt.length}条逾期）——强制推向爆发。`;
  }
  // Rule 3: If eligible hooks are ripe → lean toward climax
  else if (payoffDue && consecutiveCount >= 2 && (lastClassification === "setup" || lastClassification === "escalation")) {
    phase = "爆发";
    reasoning = isEn
      ? `Hooks are ripe for payoff and ${consecutiveCount} chapters of buildup — time to deliver.`
      : `伏笔已成熟且已蓄压${consecutiveCount}章——该爆发了。`;
  }
  // Rule 4: If last chapter was aftermath → start fresh cycle
  else if (lastClassification === "aftermath") {
    phase = "蓄压";
    reasoning = isEn
      ? "Previous chapter was aftermath — start a new mini-arc with fresh pressure."
      : "上一章是后效——开始新小周期，铺新阻力。";
  }
  // Rule 5: Natural progression based on buildup length
  else if (lastClassification === "setup" && consecutiveCount >= 2) {
    phase = payoffDue ? "爆发" : "升级";
    reasoning = isEn
      ? `${consecutiveCount} consecutive setup chapters — time to ${payoffDue ? "deliver payoff" : "escalate conflict"}.`
      : `已连续${consecutiveCount}章蓄压——该${payoffDue ? "爆发兑现" : "升级冲突"}了。`;
  }
  else if (lastClassification === "escalation") {
    phase = payoffDue ? "爆发" : "升级";
    reasoning = isEn
      ? `Escalation in progress${payoffDue ? " with ripe hooks — push to payoff" : " — continue building or escalate further"}.`
      : `正在升级中${payoffDue ? "且伏笔成熟——推向爆发" : "——继续加码或进一步升级"}。`;
  }
  // Default: derive from the last chapter's natural next step
  else {
    const naturalNext = mapClassToPhase(lastClassification);
    phase = naturalNext;
    reasoning = isEn
      ? `Continuing natural rhythm progression from ${lastClassification}.`
      : `根据上章类型（${recentRows.at(-1)?.chapterType ?? "未知"}）自然推进。`;
  }

  return {
    phase,
    reasoning,
    chaptersInCurrentPhase: consecutiveCount,
    payoffDue,
    hookDebtLevel,
  };
}

// ── Helpers ────────────────────────────────────────────────────

function isMeaningfulValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== "none" && normalized !== "(none)" && normalized !== "无";
}
