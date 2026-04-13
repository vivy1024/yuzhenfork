import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { TerminalTheme } from "../theme.js";

describe("detectTerminalTheme", () => {
  const originalEnv = process.env.COLORFGBG;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.COLORFGBG;
    } else {
      process.env.COLORFGBG = originalEnv;
    }
    vi.resetModules();
  });

  async function detect(colorfgbg?: string): Promise<TerminalTheme> {
    if (colorfgbg !== undefined) {
      process.env.COLORFGBG = colorfgbg;
    } else {
      delete process.env.COLORFGBG;
    }
    const mod = await import("../theme.js");
    return mod.detectTerminalTheme();
  }

  it("defaults to dark when COLORFGBG is not set", async () => {
    expect(await detect()).toBe("dark");
  });

  it("detects dark background from COLORFGBG with bg index 0", async () => {
    expect(await detect("15;0")).toBe("dark");
  });

  it("detects dark background from three-part COLORFGBG", async () => {
    expect(await detect("15;0;0")).toBe("dark");
  });

  it("detects light background from COLORFGBG with bg index 15", async () => {
    expect(await detect("0;15")).toBe("light");
  });

  it("detects light background from bg index 7", async () => {
    expect(await detect("0;7")).toBe("light");
  });

  it("treats index 8 as dark", async () => {
    expect(await detect("15;8")).toBe("dark");
  });

  it("defaults to dark for unparseable values", async () => {
    expect(await detect("garbage")).toBe("dark");
  });
});
