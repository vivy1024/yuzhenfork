import { describe, expect, it } from "vitest";
import {
  classifyTruthAuthority,
  normalizeTruthFileName,
} from "../interaction/truth-authority.js";
import {
  planEditTransaction,
  type EditRequest,
} from "../interaction/edit-controller.js";

describe("truth authority", () => {
  it("normalizes supported truth files", () => {
    expect(normalizeTruthFileName("story_bible")).toBe("story_bible.md");
    expect(normalizeTruthFileName("current_state.md")).toBe("current_state.md");
  });

  it("classifies control and truth authority tiers", () => {
    expect(classifyTruthAuthority("author_intent.md")).toBe("direction");
    expect(classifyTruthAuthority("current_focus.md")).toBe("direction");
    expect(classifyTruthAuthority("story_bible.md")).toBe("foundation");
    expect(classifyTruthAuthority("book_rules.md")).toBe("rules");
    expect(classifyTruthAuthority("current_state.md")).toBe("runtime-truth");
  });
});

describe("edit controller", () => {
  it("plans entity rename transactions", () => {
    const result = planEditTransaction({
      kind: "entity-rename",
      bookId: "harbor",
      entityType: "protagonist",
      oldValue: "陆尘",
      newValue: "林砚",
    });

    expect(result.transactionType).toBe("entity-rename");
    expect(result.affectedScope).toBe("book");
    expect(result.requiresTruthRebuild).toBe(true);
  });

  it("plans chapter rewrite transactions", () => {
    const result = planEditTransaction({
      kind: "chapter-rewrite",
      bookId: "harbor",
      chapterNumber: 3,
      instruction: "Keep the ending reveal.",
    });

    expect(result.transactionType).toBe("chapter-rewrite");
    expect(result.affectedScope).toBe("downstream");
    expect(result.requiresTruthRebuild).toBe(true);
  });

  it("plans local text edits without forcing full-book rebuild", () => {
    const result = planEditTransaction({
      kind: "chapter-local-edit",
      bookId: "harbor",
      chapterNumber: 5,
      instruction: "Only rewrite the final paragraph.",
    });

    expect(result.transactionType).toBe("chapter-local-edit");
    expect(result.affectedScope).toBe("chapter");
    expect(result.requiresTruthRebuild).toBe(true);
  });

  it("plans truth-file edits with authority metadata", () => {
    const result = planEditTransaction({
      kind: "truth-file-edit",
      bookId: "harbor",
      fileName: "book_rules",
      instruction: "Lock the protagonist name to Lin Yan.",
    });

    expect(result.transactionType).toBe("truth-file-edit");
    expect(result.truthAuthority).toBe("rules");
    expect(result.affectedScope).toBe("book");
  });

  it("plans focus edits as direction-level transactions", () => {
    const result = planEditTransaction({
      kind: "focus-edit",
      bookId: "harbor",
      instruction: "Bring the story back to the old case.",
    });

    expect(result.transactionType).toBe("focus-edit");
    expect(result.truthAuthority).toBe("direction");
    expect(result.affectedScope).toBe("future");
    expect(result.requiresTruthRebuild).toBe(false);
  });
});
