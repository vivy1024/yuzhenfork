import { classifyTruthAuthority, normalizeTruthFileName, type TruthAuthority } from "./truth-authority.js";

export type EditRequest =
  | {
      readonly kind: "entity-rename";
      readonly bookId: string;
      readonly entityType: "protagonist" | "character" | "location" | "organization";
      readonly oldValue: string;
      readonly newValue: string;
    }
  | {
      readonly kind: "chapter-rewrite";
      readonly bookId: string;
      readonly chapterNumber: number;
      readonly instruction: string;
    }
  | {
      readonly kind: "chapter-local-edit";
      readonly bookId: string;
      readonly chapterNumber: number;
      readonly instruction: string;
    }
  | {
      readonly kind: "truth-file-edit";
      readonly bookId: string;
      readonly fileName: string;
      readonly instruction: string;
    }
  | {
      readonly kind: "focus-edit";
      readonly bookId: string;
      readonly instruction: string;
    };

export interface PlannedEditTransaction {
  readonly transactionType: EditRequest["kind"];
  readonly bookId: string;
  readonly chapterNumber?: number;
  readonly truthAuthority?: TruthAuthority;
  readonly normalizedFileName?: string;
  readonly affectedScope: "chapter" | "downstream" | "future" | "book";
  readonly requiresTruthRebuild: boolean;
}

export function planEditTransaction(request: EditRequest): PlannedEditTransaction {
  switch (request.kind) {
    case "entity-rename":
      return {
        transactionType: request.kind,
        bookId: request.bookId,
        affectedScope: "book",
        requiresTruthRebuild: true,
      };
    case "chapter-rewrite":
      return {
        transactionType: request.kind,
        bookId: request.bookId,
        chapterNumber: request.chapterNumber,
        affectedScope: "downstream",
        requiresTruthRebuild: true,
      };
    case "chapter-local-edit":
      return {
        transactionType: request.kind,
        bookId: request.bookId,
        chapterNumber: request.chapterNumber,
        affectedScope: "chapter",
        requiresTruthRebuild: true,
      };
    case "truth-file-edit": {
      const normalizedFileName = normalizeTruthFileName(request.fileName);
      const truthAuthority = classifyTruthAuthority(normalizedFileName);
      return {
        transactionType: request.kind,
        bookId: request.bookId,
        normalizedFileName,
        truthAuthority,
        affectedScope: truthAuthority === "runtime-truth" ? "book" : truthAuthority === "memory" ? "book" : "book",
        requiresTruthRebuild: truthAuthority === "runtime-truth" || truthAuthority === "memory",
      };
    }
    case "focus-edit":
      return {
        transactionType: request.kind,
        bookId: request.bookId,
        truthAuthority: "direction",
        normalizedFileName: "current_focus.md",
        affectedScope: "future",
        requiresTruthRebuild: false,
      };
  }
}
