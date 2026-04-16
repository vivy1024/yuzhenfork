import { describe, expect, it, vi } from "vitest";
import {
  probeServiceForDetail,
  rehydrateServiceConnectionStatus,
  saveServiceConfigWithValidation,
} from "./ServiceDetailPage";

describe("service detail state helpers", () => {
  it("rehydrates connection status by validating via /test instead of /models", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ apiKey: "sk-live" })
      .mockResolvedValueOnce({ ok: true, models: [{ id: "gpt-5.4" }] });

    const result = await rehydrateServiceConnectionStatus(fetcher as any, {
      connected: true,
      effectiveServiceId: "openai",
      apiFormat: "chat",
      stream: false,
      isCustom: false,
      baseUrl: "",
    });

    expect(result).toMatchObject({ ok: true, models: [{ id: "gpt-5.4" }] });
    expect(fetcher).toHaveBeenNthCalledWith(1, "/services/openai/secret");
    expect(fetcher).toHaveBeenNthCalledWith(2, "/services/openai/test", expect.objectContaining({
      method: "POST",
    }));
  });

  it("validates API key before persisting service config", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, models: [{ id: "MiniMax-M2.7" }], selectedModel: "MiniMax-M2.7" })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    await saveServiceConfigWithValidation(fetcher as any, {
      effectiveServiceId: "minimax",
      serviceId: "minimax",
      isCustom: false,
      resolvedCustomName: "",
      baseUrl: "",
      apiKey: "sk-live",
      apiFormat: "chat",
      stream: false,
      temperature: "0.7",
      maxTokens: "4096",
      defaultModel: "MiniMax-M2.7",
    });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/services/minimax/test", expect.objectContaining({
      method: "POST",
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/services/minimax/secret", expect.objectContaining({
      method: "PUT",
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/services/config", expect.objectContaining({
      method: "PUT",
    }));
  });

  it("does not persist anything when validation fails", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: "API Key 无效，请检查后重试" });

    await expect(saveServiceConfigWithValidation(fetcher as any, {
      effectiveServiceId: "openai",
      serviceId: "openai",
      isCustom: false,
      resolvedCustomName: "",
      baseUrl: "",
      apiKey: "sk-bad",
      apiFormat: "chat",
      stream: false,
      temperature: "0.7",
      maxTokens: "4096",
      defaultModel: undefined,
    })).rejects.toThrow("API Key 无效，请检查后重试");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/services/openai/test", expect.objectContaining({
      method: "POST",
    }));
  });
});
