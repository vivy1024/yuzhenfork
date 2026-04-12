import { describe, expect, it } from "vitest";
import { resolveComposerCaretState } from "../tui/composer-caret.js";

describe("tui composer caret", () => {
  it("keeps the empty composer caret visible without animation", () => {
    expect(resolveComposerCaretState({
      inputValue: "",
      isSubmitting: false,
      blinkTick: 0,
    })).toEqual({
      visible: true,
      shouldAnimate: false,
    });
  });

  it("blinks briefly after typing and then settles", () => {
    expect(resolveComposerCaretState({
      inputValue: "continue",
      isSubmitting: false,
      blinkTick: 0,
    })).toEqual({
      visible: true,
      shouldAnimate: true,
    });

    expect(resolveComposerCaretState({
      inputValue: "continue",
      isSubmitting: false,
      blinkTick: 1,
    })).toEqual({
      visible: false,
      shouldAnimate: true,
    });

    expect(resolveComposerCaretState({
      inputValue: "continue",
      isSubmitting: false,
      blinkTick: 2,
    })).toEqual({
      visible: true,
      shouldAnimate: false,
    });
  });

  it("hides the caret while submitting", () => {
    expect(resolveComposerCaretState({
      inputValue: "continue",
      isSubmitting: true,
      blinkTick: 0,
    })).toEqual({
      visible: false,
      shouldAnimate: false,
    });
  });
});
