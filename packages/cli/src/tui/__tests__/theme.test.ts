import { describe, expect, it, vi, afterEach } from "vitest";
import type { TerminalTheme } from "../theme.js";

describe("detectTerminalTheme", () => {
  const originalEnv = process.env.COLORFGBG;
  const originalPlatform = process.platform;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.COLORFGBG;
    } else {
      process.env.COLORFGBG = originalEnv;
    }
    Object.defineProperty(process, "platform", { value: originalPlatform });
    vi.resetModules();
  });

  async function detect(opts?: { colorfgbg?: string; platform?: string }): Promise<TerminalTheme> {
    if (opts?.colorfgbg !== undefined) {
      process.env.COLORFGBG = opts.colorfgbg;
    } else {
      delete process.env.COLORFGBG;
    }
    if (opts?.platform) {
      Object.defineProperty(process, "platform", { value: opts.platform });
    }
    const mod = await import("../theme.js");
    return mod.detectTerminalTheme();
  }

  it("detects dark background from COLORFGBG bg index 0", async () => {
    expect(await detect({ colorfgbg: "15;0" })).toBe("dark");
  });

  it("detects dark from three-part COLORFGBG", async () => {
    expect(await detect({ colorfgbg: "15;0;0" })).toBe("dark");
  });

  it("detects light background from COLORFGBG bg index 15", async () => {
    expect(await detect({ colorfgbg: "0;15" })).toBe("light");
  });

  it("detects light from bg index 7", async () => {
    expect(await detect({ colorfgbg: "0;7" })).toBe("light");
  });

  it("treats index 8 as dark", async () => {
    expect(await detect({ colorfgbg: "15;8" })).toBe("dark");
  });

  it("defaults to dark on non-darwin without COLORFGBG", async () => {
    expect(await detect({ platform: "linux" })).toBe("dark");
  });
});
