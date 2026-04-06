import { describe, expect, it } from "vitest";
import { formatTuiResult } from "../tui/output.js";

describe("tui output", () => {
  it("summarizes a completed write flow", () => {
    expect(formatTuiResult({
      intent: "write_next",
      status: "completed",
      bookId: "harbor",
    })).toContain("Completed write_next for harbor");
  });

  it("summarizes a mode switch", () => {
    expect(formatTuiResult({
      intent: "switch_mode",
      status: "completed",
      mode: "auto",
    })).toContain("Switched mode to auto");
  });
});
