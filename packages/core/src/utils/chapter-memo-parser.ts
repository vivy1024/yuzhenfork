import YAML from "js-yaml";
import { ChapterMemoSchema, type ChapterMemo } from "../models/input-governance.js";

export class PlannerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlannerParseError";
  }
}

// Phase hotfix 4: each required section is a (zh, en) heading pair.
// The English headings come from PLANNER_MEMO_SYSTEM_PROMPT_EN — we accept
// EITHER language at parse time so the same parser works for both.
const REQUIRED_SECTIONS: ReadonlyArray<{
  readonly zh: string;
  readonly en: string;
}> = [
  { zh: "## 当前任务", en: "## Current task" },
  { zh: "## 读者此刻在等什么", en: "## What the reader is waiting for right now" },
  { zh: "## 该兑现的 / 暂不掀的", en: "## To pay off / to keep buried" },
  { zh: "## 日常/过渡承担什么任务", en: "## What the slow / transitional beats carry" },
  { zh: "## 关键抉择过三连问", en: "## Three-question check on the key choice" },
  { zh: "## 章尾必须发生的改变", en: "## Required end-of-chapter change" },
  { zh: "## 不要做", en: "## Do not" },
];

/**
 * Parse a planner memo produced by the LLM.
 *
 * Format: YAML frontmatter delimited by `---\n...\n---\n` followed by a
 * markdown body containing the seven required section headings.
 *
 * Strict on core fields (chapter integer + matches expected, goal non-empty
 * and ≤ 50 chars, required section headings present). Lenient on aux fields
 * (threadRefs coerced to string[], defaults to []).
 *
 * `isGoldenOpening` is authoritative from the caller — any value the LLM
 * includes in the frontmatter is ignored.
 */
export function parseMemo(
  raw: string,
  expectedChapter: number,
  isGoldenOpening: boolean,
): ChapterMemo {
  const trimmed = raw.trim();
  const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    throw new PlannerParseError("missing YAML frontmatter delimiters");
  }

  const yamlText = match[1]!;
  const body = match[2]!.trim();

  let fm: unknown;
  try {
    fm = YAML.load(yamlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PlannerParseError(`invalid YAML in frontmatter: ${message}`);
  }
  if (!fm || typeof fm !== "object" || Array.isArray(fm)) {
    throw new PlannerParseError("frontmatter is not an object");
  }
  const f = fm as Record<string, unknown>;

  if (typeof f.chapter !== "number" || !Number.isInteger(f.chapter)) {
    throw new PlannerParseError("chapter must be an integer");
  }
  if (f.chapter !== expectedChapter) {
    throw new PlannerParseError(
      `chapter mismatch: expected ${expectedChapter}, got ${f.chapter}`,
    );
  }

  if (typeof f.goal !== "string" || f.goal.length === 0) {
    throw new PlannerParseError("goal must be a non-empty string");
  }
  if (f.goal.length > 50) {
    throw new PlannerParseError(
      `goal too long: ${f.goal.length} chars (max 50)`,
    );
  }

  const missing = REQUIRED_SECTIONS.filter(
    (section) => !body.includes(section.zh) && !body.includes(section.en),
  );
  if (missing.length > 0) {
    // Report by zh heading (canonical) so the LLM-feedback loop stays stable.
    throw new PlannerParseError(
      `missing sections: ${missing.map((s) => s.zh).join(", ")}`,
    );
  }

  const threadRefs = Array.isArray(f.threadRefs)
    ? f.threadRefs.filter((value): value is string => typeof value === "string")
    : [];

  return ChapterMemoSchema.parse({
    chapter: f.chapter,
    goal: f.goal,
    isGoldenOpening,
    body,
    threadRefs,
  });
}
