import { describe, it, expect } from "vitest";
import { getAllProviders, getProvider } from "../llm/providers/index.js";

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

  it("B1：中国原厂批次 1 全部收录（10 个）", () => {
    const ids = getAllProviders().map((p) => p.id);
    for (const id of [
      "moonshot", "zhipu", "siliconcloud", "ppio", "bailian",
      "volcengine", "hunyuan", "baichuan", "stepfun", "wenxin",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("B1：bailian 保留 anthropic-messages api（例外，不按 lobe 迁移）", () => {
    expect(getProvider("bailian")?.api).toBe("anthropic-messages");
    expect(getProvider("bailian")?.baseUrl).toContain("/anthropic");
  });

  it("B1：minimax 保留 anthropic-messages api（例外）", () => {
    expect(getProvider("minimax")?.api).toBe("anthropic-messages");
    expect(getProvider("minimax")?.baseUrl).toContain("/anthropic");
  });

  it("B2：中国原厂批次 2 全部收录（6 个）", () => {
    const ids = getAllProviders().map((p) => p.id);
    for (const id of ["spark", "sensenova", "tencentcloud", "xiaomimimo", "longcat", "internlm"]) {
      expect(ids).toContain(id);
    }
  });
});
