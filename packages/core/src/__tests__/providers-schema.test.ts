import { describe, it, expect } from "vitest";
import { getAllProviders } from "../llm/providers/index.js";

describe("providers structural integrity", () => {
  it("每个 provider 必填字段都存在", () => {
    for (const p of getAllProviders()) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.api).toMatch(/^(openai-completions|openai-responses|anthropic-messages)$/);
      expect(p.baseUrl).toBeTruthy();
    }
  });

  it("每个 model card 必填字段都存在且 contextWindowTokens >= maxOutput", () => {
    for (const p of getAllProviders()) {
      for (const m of p.models) {
        expect(m.id, `provider=${p.id}`).toBeTruthy();
        expect(m.maxOutput, `provider=${p.id} model=${m.id}`).toBeGreaterThan(0);
        expect(m.contextWindowTokens, `provider=${p.id} model=${m.id}`).toBeGreaterThanOrEqual(m.maxOutput);
      }
    }
  });

  it("每个 provider 的 id 唯一", () => {
    const ids = getAllProviders().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个 provider 里 models 的 id 唯一", () => {
    for (const p of getAllProviders()) {
      const ids = p.models.map((m) => m.id);
      expect(new Set(ids).size, `provider=${p.id} 有重复 model id`).toBe(ids.length);
    }
  });

  it("A 组至少有 6 个核心 provider", () => {
    const ids = getAllProviders().map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("google");
    expect(ids).toContain("deepseek");
    expect(ids).toContain("qwen");
    expect(ids).toContain("minimax");
  });
});
