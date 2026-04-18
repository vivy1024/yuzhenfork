/**
 * Phase 9-3: hard gate that a chapter draft actually acts on the hook ledger
 * the planner declared in the memo's "## 本章 hook 账" / "## Hook ledger for
 * this chapter" section.
 *
 * The planner commits, per chapter, to:
 *   - advance: <hook_id> "name" → state-change
 *   - resolve: <hook_id> "name" → action
 *
 * This validator parses those two lists and checks that each committed
 * hook_id is echoed somewhere in the draft body. A silent failure would
 * let the planner promise advancement the writer never delivered — exactly
 * the "debt keeps piling up" failure mode Phase 9 is meant to prevent.
 *
 * A missing echo is a "critical" severity violation so the review cycle
 * forces a reviser pass instead of shipping.
 */

export interface HookLedgerViolation {
  readonly severity: "critical";
  readonly category: string;
  readonly description: string;
  readonly suggestion: string;
}

export interface HookLedger {
  readonly open: ReadonlyArray<string>;
  readonly advance: ReadonlyArray<string>;
  readonly resolve: ReadonlyArray<string>;
  readonly defer: ReadonlyArray<string>;
}

const LEDGER_HEADING_PATTERNS = [
  /^#{2,3}\s*本章\s*hook\s*账\s*$/im,
  /^#{2,3}\s*Hook\s+ledger\s+for\s+this\s+chapter\s*$/im,
];

const SUBSECTION_KEYS: ReadonlyArray<keyof HookLedger> = ["open", "advance", "resolve", "defer"];

/**
 * Extract the hook ledger's four sub-lists from a memo body. Hook IDs follow
 * the pending_hooks convention — typically H###, S###, or an alphanumeric
 * token. We accept any token matching [A-Za-z][A-Za-z0-9_-]{0,15} so the
 * validator is robust to ID style differences between books.
 */
export function parseHookLedger(memoBody: string): HookLedger {
  const section = extractLedgerSection(memoBody);
  if (!section) {
    return { open: [], advance: [], resolve: [], defer: [] };
  }

  const result: Record<keyof HookLedger, string[]> = {
    open: [],
    advance: [],
    resolve: [],
    defer: [],
  };

  let current: keyof HookLedger | null = null;
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const subHeadingMatch = line.match(/^(open|advance|resolve|defer)\s*[:：]?\s*$/i);
    if (subHeadingMatch) {
      current = subHeadingMatch[1]!.toLowerCase() as keyof HookLedger;
      continue;
    }

    if (!current) continue;
    if (!line.startsWith("-")) continue;

    const id = extractHookIdFromLine(line);
    if (id) result[current].push(id);
  }

  return result;
}

/**
 * Enforce: every hook_id declared under advance / resolve must appear in the
 * draft text. We do NOT validate `open` (new hooks by definition don't have
 * a pre-existing ID to echo) or `defer` (deferred = deliberately not touched).
 */
export function validateHookLedger(
  memoBody: string,
  draftContent: string,
): ReadonlyArray<HookLedgerViolation> {
  const ledger = parseHookLedger(memoBody);
  const committedIds = dedupe([...ledger.advance, ...ledger.resolve]);
  if (committedIds.length === 0) return [];

  const violations: HookLedgerViolation[] = [];
  for (const id of committedIds) {
    if (!draftEchoesHookId(draftContent, id)) {
      violations.push({
        severity: "critical",
        category: "hook 账未兑现",
        description: `memo 在 advance/resolve 里声明要处理 ${id}，但正文没有对应的落地动作`,
        suggestion: `在正文中加入对 ${id} 的具体情节推进（动作、对话、环境变化），或把它从 hook 账里移到 defer 并给出理由`,
      });
    }
  }
  return violations;
}

function extractLedgerSection(memoBody: string): string | undefined {
  for (const pattern of LEDGER_HEADING_PATTERNS) {
    const match = memoBody.match(pattern);
    if (!match || match.index === undefined) continue;
    const start = match.index + match[0].length;
    const rest = memoBody.slice(start);
    // Stop at the next H2/H3 heading.
    const nextHeading = rest.match(/\n#{2,3}\s/);
    const end = nextHeading ? nextHeading.index ?? rest.length : rest.length;
    return rest.slice(0, end);
  }
  return undefined;
}

function extractHookIdFromLine(line: string): string | undefined {
  // Strip leading "-" bullet and any trailing punctuation before checking.
  const cleaned = line.replace(/^-+\s*/, "").trim();
  if (cleaned.startsWith("[new]") || cleaned.startsWith("[NEW]")) return undefined;

  // Hook IDs: H007, S004, hook_12, 主线-01, etc. Match a token that starts
  // with a letter/CJK and contains [A-Za-z0-9_-]. We stop at whitespace or
  // quote so "H007 \"xxx\"" cleanly yields "H007".
  const idMatch = cleaned.match(/^([A-Za-z\u4e00-\u9fff][A-Za-z0-9_\-\u4e00-\u9fff]{0,19})/);
  if (!idMatch) return undefined;

  const candidate = idMatch[1]!;
  // Reject obvious non-IDs like "open", "advance" that slipped through.
  if (/^(open|advance|resolve|defer|new)$/i.test(candidate)) return undefined;
  return candidate;
}

function draftEchoesHookId(draftContent: string, id: string): boolean {
  // Exact token match — word boundary for ASCII, simple substring for CJK.
  if (/^[A-Za-z0-9_-]+$/.test(id)) {
    const pattern = new RegExp(`\\b${escapeRegex(id)}\\b`);
    if (pattern.test(draftContent)) return true;
  } else {
    if (draftContent.includes(id)) return true;
  }

  // Also accept the hook's name quoted in the ledger line — but we only have
  // the ID here. Name-based matching is the responsibility of the caller if
  // it wants softer gating. This validator stays strict on IDs.
  return false;
}

function dedupe(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const INTERNAL = {
  SUBSECTION_KEYS,
  extractLedgerSection,
  extractHookIdFromLine,
};
