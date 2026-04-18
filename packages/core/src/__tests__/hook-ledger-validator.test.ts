import { describe, it, expect } from "vitest";
import {
  parseHookLedger,
  validateHookLedger,
} from "../utils/hook-ledger-validator.js";

const ZH_MEMO = `## 当前任务
林秋潜入账房取回账册。

## 本章 hook 账
open:
- [new] 旧港眼线盯梢 || 理由：留给下一卷

advance:
- H007 "胖虎借条" → planted → pressured
- H012 "雷架焦痕" → pressured → near_payoff

resolve:
- H003 "杂役腰牌" → 林秋主动摘下

defer:
- H009 "守拙诀来历" → 本章不动

## 不要做
- 不要点破母亲身份`;

const EN_MEMO = `## Current task
Lin Qiu lifts the ledger from the Old Port accounting hall.

## Hook ledger for this chapter
open:
- [new] Old Port tail || reason: save for later arc

advance:
- H007 "Huzi's IOU" → planted → pressured

resolve:
- H003 "errand badge" → Lin Qiu unpins it himself

defer:
- H009 "Shou-Zhuo Jue origin" → timing not right

## Do not
- Do not reveal the mother's name`;

describe("parseHookLedger", () => {
  it("extracts all four sub-lists from a zh memo", () => {
    const ledger = parseHookLedger(ZH_MEMO);
    expect(ledger.advance).toEqual(["H007", "H012"]);
    expect(ledger.resolve).toEqual(["H003"]);
    expect(ledger.defer).toEqual(["H009"]);
    // open uses [new] so no hook_id is extracted
    expect(ledger.open).toEqual([]);
  });

  it("extracts all four sub-lists from an en memo", () => {
    const ledger = parseHookLedger(EN_MEMO);
    expect(ledger.advance).toEqual(["H007"]);
    expect(ledger.resolve).toEqual(["H003"]);
    expect(ledger.defer).toEqual(["H009"]);
  });

  it("returns empty lists when no ledger section is present", () => {
    const ledger = parseHookLedger("## 当前任务\n正文\n\n## 不要做\n- 无");
    expect(ledger).toEqual({ open: [], advance: [], resolve: [], defer: [] });
  });

  it("stops at the next H2 heading and does not pollute across sections", () => {
    const memo = `## 本章 hook 账
advance:
- H007 "xxx" → ...

## 不要做
- H999 looks-like-a-hook-but-its-under-do-not`;
    const ledger = parseHookLedger(memo);
    expect(ledger.advance).toEqual(["H007"]);
    expect(ledger.defer).toEqual([]);
  });
});

describe("validateHookLedger", () => {
  it("passes when draft echoes every committed hook_id", () => {
    const draft = "林秋摸出胖虎借条（H007），又被雷架焦痕 H012 刺到眼睛。随后他摘下 H003 腰牌。";
    const violations = validateHookLedger(ZH_MEMO, draft);
    expect(violations).toEqual([]);
  });

  it("flags a critical violation for each un-echoed advance/resolve id", () => {
    const draft = "林秋只摸出 H007 借条，其他都没写。";
    const violations = validateHookLedger(ZH_MEMO, draft);
    // H012 advance and H003 resolve are missing
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.severity === "critical")).toBe(true);
    expect(violations.map((v) => v.description).join(" ")).toContain("H012");
    expect(violations.map((v) => v.description).join(" ")).toContain("H003");
  });

  it("does NOT flag hooks that are only under defer", () => {
    // H009 is deferred — if draft doesn't echo it, that's fine
    const draft = "林秋翻出 H007、H012 推进情节。林秋摘下 H003 腰牌。";
    const violations = validateHookLedger(ZH_MEMO, draft);
    expect(violations).toEqual([]);
  });

  it("does NOT flag [new] open entries (they have no pre-existing id)", () => {
    const memo = `## 本章 hook 账
open:
- [new] 新钩子 || 理由
advance:
- H001 "test" → x
`;
    const draft = "正文里有 H001。";
    const violations = validateHookLedger(memo, draft);
    expect(violations).toEqual([]);
  });

  it("returns empty array when memo has no ledger section at all", () => {
    const violations = validateHookLedger("## 别的东西\n正文", "draft");
    expect(violations).toEqual([]);
  });

  it("uses word boundary so H12 does not accidentally match H1 or H123", () => {
    const memo = `## 本章 hook 账
advance:
- H1 "a" → x
`;
    // Draft contains H12, which must NOT satisfy the H1 commitment
    const draft = "剧情涉及 H12 和 H123。";
    const violations = validateHookLedger(memo, draft);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.description).toContain("H1");
  });
});
