import { describe, expect, it } from "vitest";
import { coerceSharedSessionMessages, resolveDirectWriteTarget } from "./ChatBar";

describe("resolveDirectWriteTarget", () => {
  it("prefers the active book when the user is already inside a book flow", () => {
    expect(resolveDirectWriteTarget("beta", [
      { id: "alpha" },
      { id: "beta" },
    ])).toEqual({
      bookId: "beta",
      reason: "active",
    });
  });

  it("falls back to the only book when there is no active context", () => {
    expect(resolveDirectWriteTarget(undefined, [{ id: "solo" }])).toEqual({
      bookId: "solo",
      reason: "single",
    });
  });

  it("reports when there is no available target book", () => {
    expect(resolveDirectWriteTarget(undefined, [])).toEqual({
      bookId: null,
      reason: "missing",
    });
  });

  it("does not guess when multiple books exist without an active context", () => {
    expect(resolveDirectWriteTarget(undefined, [
      { id: "alpha" },
      { id: "beta" },
    ])).toEqual({
      bookId: null,
      reason: "ambiguous",
    });
  });

  it("coerces shared session messages into chat bubbles", () => {
    expect(coerceSharedSessionMessages([
      { role: "user", content: "continue", timestamp: 1 },
      { role: "assistant", content: "Completed write_next for harbor.", timestamp: 2 },
      { role: "system", content: "internal", timestamp: 3 },
    ])).toEqual([
      { role: "user", content: "continue", timestamp: 1 },
      { role: "assistant", content: "Completed write_next for harbor.", timestamp: 2 },
    ]);
  });
});
