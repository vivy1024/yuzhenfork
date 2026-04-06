import { describe, expect, it } from "vitest";
import { routeNaturalLanguageIntent } from "../interaction/nl-router.js";

describe("interaction natural-language router", () => {
  it("maps continue-style requests to write_next", () => {
    expect(routeNaturalLanguageIntent("continue", { activeBookId: "harbor" })).toEqual({
      intent: "write_next",
      bookId: "harbor",
    });
    expect(routeNaturalLanguageIntent("继续写", { activeBookId: "harbor" })).toEqual({
      intent: "write_next",
      bookId: "harbor",
    });
  });

  it("maps pause requests to pause_book", () => {
    expect(routeNaturalLanguageIntent("pause this book", { activeBookId: "harbor" })).toEqual({
      intent: "pause_book",
      bookId: "harbor",
    });
  });

  it("maps rewrite chapter requests with chapter numbers", () => {
    expect(routeNaturalLanguageIntent("rewrite chapter 3", { activeBookId: "harbor" })).toEqual({
      intent: "rewrite_chapter",
      bookId: "harbor",
      chapterNumber: 3,
    });
    expect(routeNaturalLanguageIntent("重写第3章", { activeBookId: "harbor" })).toEqual({
      intent: "rewrite_chapter",
      bookId: "harbor",
      chapterNumber: 3,
    });
  });

  it("maps revise chapter requests with freeform instructions", () => {
    expect(routeNaturalLanguageIntent("revise chapter 5 ending only", { activeBookId: "harbor" })).toEqual({
      intent: "revise_chapter",
      bookId: "harbor",
      chapterNumber: 5,
      instruction: "ending only",
    });
  });

  it("maps focus updates to update_focus", () => {
    expect(routeNaturalLanguageIntent("把 focus 拉回旧案线", { activeBookId: "harbor" })).toEqual({
      intent: "update_focus",
      bookId: "harbor",
      instruction: "把 focus 拉回旧案线",
    });
  });

  it("maps explanation requests to explain_failure", () => {
    expect(routeNaturalLanguageIntent("为什么主角名字没按设定走", { activeBookId: "harbor" })).toEqual({
      intent: "explain_failure",
      bookId: "harbor",
      instruction: "为什么主角名字没按设定走",
    });
  });

  it("maps mode switch requests to switch_mode", () => {
    expect(routeNaturalLanguageIntent("切换到全自动", { activeBookId: "harbor" })).toEqual({
      intent: "switch_mode",
      mode: "auto",
    });
    expect(routeNaturalLanguageIntent("半自动", { activeBookId: "harbor" })).toEqual({
      intent: "switch_mode",
      mode: "semi",
    });
    expect(routeNaturalLanguageIntent("切到全自主", { activeBookId: "harbor" })).toEqual({
      intent: "switch_mode",
      mode: "manual",
    });
  });

  it("maps slash commands for direct control", () => {
    expect(routeNaturalLanguageIntent("/write", { activeBookId: "harbor" })).toEqual({
      intent: "write_next",
      bookId: "harbor",
    });
    expect(routeNaturalLanguageIntent("/mode auto", { activeBookId: "harbor" })).toEqual({
      intent: "switch_mode",
      mode: "auto",
    });
    expect(routeNaturalLanguageIntent("/rewrite 3", { activeBookId: "harbor" })).toEqual({
      intent: "rewrite_chapter",
      bookId: "harbor",
      chapterNumber: 3,
    });
    expect(routeNaturalLanguageIntent("/focus bring it back to the old case", { activeBookId: "harbor" })).toEqual({
      intent: "update_focus",
      bookId: "harbor",
      instruction: "bring it back to the old case",
    });
    expect(routeNaturalLanguageIntent("/truth current_focus.md Bring it back", { activeBookId: "harbor" })).toEqual({
      intent: "edit_truth",
      bookId: "harbor",
      fileName: "current_focus.md",
      instruction: "Bring it back",
    });
    expect(routeNaturalLanguageIntent("/rename 陆尘 => 林砚", { activeBookId: "harbor" })).toEqual({
      intent: "rename_entity",
      bookId: "harbor",
      oldValue: "陆尘",
      newValue: "林砚",
    });
    expect(routeNaturalLanguageIntent("/replace 3 旧名字 => 新名字", { activeBookId: "harbor" })).toEqual({
      intent: "patch_chapter_text",
      bookId: "harbor",
      chapterNumber: 3,
      targetText: "旧名字",
      replacementText: "新名字",
    });
  });

  it("maps rename and chapter patch requests from natural language", () => {
    expect(routeNaturalLanguageIntent("把陆尘改成林砚", { activeBookId: "harbor" })).toEqual({
      intent: "rename_entity",
      bookId: "harbor",
      oldValue: "陆尘",
      newValue: "林砚",
    });
    expect(routeNaturalLanguageIntent("rename Lu Chen to Lin Yan", { activeBookId: "harbor" })).toEqual({
      intent: "rename_entity",
      bookId: "harbor",
      oldValue: "Lu Chen",
      newValue: "Lin Yan",
    });
  });
});
