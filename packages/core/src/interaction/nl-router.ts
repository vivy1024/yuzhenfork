import type { InteractionRequest } from "./intents.js";

export interface NaturalLanguageRoutingContext {
  readonly activeBookId?: string;
}

export function routeNaturalLanguageIntent(
  input: string,
  context: NaturalLanguageRoutingContext = {},
): InteractionRequest {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const bookId = context.activeBookId;

  if (/^(continue|继续|继续写|写下一章|write next)$/i.test(trimmed)) {
    return {
      intent: "write_next",
      ...(bookId ? { bookId } : {}),
    };
  }

  if (/^(pause|pause this book|暂停|暂停这本书)$/i.test(trimmed)) {
    return {
      intent: "pause_book",
      ...(bookId ? { bookId } : {}),
    };
  }

  const rewriteMatch = trimmed.match(/(?:rewrite chapter|重写第)\s*(\d+)\s*(?:章)?/i);
  if (rewriteMatch) {
    return {
      intent: "rewrite_chapter",
      ...(bookId ? { bookId } : {}),
      chapterNumber: parseInt(rewriteMatch[1]!, 10),
    };
  }

  const reviseMatch = trimmed.match(/revise chapter\s*(\d+)\s*(.*)$/i);
  if (reviseMatch) {
    const trailing = reviseMatch[2]?.trim();
    return {
      intent: "revise_chapter",
      ...(bookId ? { bookId } : {}),
      chapterNumber: parseInt(reviseMatch[1]!, 10),
      ...(trailing ? { instruction: trailing } : {}),
    };
  }

  if (/(focus|聚焦|主线|旧案线)/i.test(trimmed)) {
    return {
      intent: "update_focus",
      ...(bookId ? { bookId } : {}),
      instruction: trimmed,
    };
  }

  if (/(为什么|why)/i.test(trimmed)) {
    return {
      intent: "explain_failure",
      ...(bookId ? { bookId } : {}),
      instruction: trimmed,
    };
  }

  return {
    intent: "explain_status",
    ...(bookId ? { bookId } : {}),
    instruction: lower,
  };
}
