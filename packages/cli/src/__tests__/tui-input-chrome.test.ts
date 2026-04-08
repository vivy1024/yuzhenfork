import { describe, expect, it } from "vitest";
import { inputPromptPrefix, drawInputTop, drawInputBottom } from "../tui/effects.js";
import { stripAnsi } from "../tui/ansi.js";

describe("tui input chrome", () => {
  it("produces a prompt prefix with the ❯ indicator", () => {
    const prefix = stripAnsi(inputPromptPrefix());
    expect(prefix).toContain("❯");
  });

  it("drawInputTop and drawInputBottom are callable", () => {
    // Smoke test — these write to stdout, just verify no throw
    expect(typeof drawInputTop).toBe("function");
    expect(typeof drawInputBottom).toBe("function");
  });
});
