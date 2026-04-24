import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeModelsFromUpstream } from "../llm/providers/probe.js";

describe("probeModelsFromUpstream", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("正常响应返回 ProbedModel 数组", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4" }, { id: "gpt-3.5" }] }),
    });
    const result = await probeModelsFromUpstream("https://api.example.com/v1", "sk-test");
    expect(result).toEqual([
      { id: "gpt-4", name: "gpt-4", contextWindow: 0 },
      { id: "gpt-3.5", name: "gpt-3.5", contextWindow: 0 },
    ]);
  });

  it("非 2xx 返回空数组", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false });
    const result = await probeModelsFromUpstream("https://api.example.com/v1", "sk-test");
    expect(result).toEqual([]);
  });

  it("fetch 抛错返回空数组", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("network down"));
    const result = await probeModelsFromUpstream("https://api.example.com/v1", "sk-test");
    expect(result).toEqual([]);
  });

  it("响应 json.data 不是数组返回空数组", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: "not-an-array" }),
    });
    const result = await probeModelsFromUpstream("https://api.example.com/v1", "sk-test");
    expect(result).toEqual([]);
  });

  it("baseUrl 或 apiKey 空直接返回空数组,不发请求", async () => {
    const r1 = await probeModelsFromUpstream("", "sk-test");
    const r2 = await probeModelsFromUpstream("https://x.com", "");
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("过滤掉 id 非字符串的 entry", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "valid" }, { id: null }, { id: 123 }, {}] }),
    });
    const result = await probeModelsFromUpstream("https://api.example.com/v1", "sk-test");
    expect(result).toEqual([{ id: "valid", name: "valid", contextWindow: 0 }]);
  });
});
