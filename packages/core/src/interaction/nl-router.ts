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

  if (/^\/write$/i.test(trimmed)) {
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

  const modeCommand = trimmed.match(/^\/mode\s+(auto|semi|manual)$/i);
  if (modeCommand) {
    return {
      intent: "switch_mode",
      mode: modeCommand[1]!.toLowerCase() as "auto" | "semi" | "manual",
    };
  }

  if (/(全自动|auto mode|switch to auto|切换到全自动)/i.test(trimmed)) {
    return {
      intent: "switch_mode",
      mode: "auto",
    };
  }

  if (/(半自动|semi mode|switch to semi)/i.test(trimmed)) {
    return {
      intent: "switch_mode",
      mode: "semi",
    };
  }

  if (/(全自主|手动模式|manual mode|switch to manual)/i.test(trimmed)) {
    return {
      intent: "switch_mode",
      mode: "manual",
    };
  }

  const slashRewrite = trimmed.match(/^\/rewrite\s+(\d+)$/i);
  if (slashRewrite) {
    return {
      intent: "rewrite_chapter",
      ...(bookId ? { bookId } : {}),
      chapterNumber: parseInt(slashRewrite[1]!, 10),
    };
  }

  const slashFocus = trimmed.match(/^\/focus\s+(.+)$/i);
  if (slashFocus) {
    return {
      intent: "update_focus",
      ...(bookId ? { bookId } : {}),
      instruction: slashFocus[1]!.trim(),
    };
  }

  const slashTruth = trimmed.match(/^\/truth\s+([^\s]+)\s+([\s\S]+)$/i);
  if (slashTruth) {
    return {
      intent: "edit_truth",
      ...(bookId ? { bookId } : {}),
      fileName: slashTruth[1]!.trim(),
      instruction: slashTruth[2]!.trim(),
    };
  }

  const slashRename = trimmed.match(/^\/rename\s+(.+?)\s*=>\s*(.+)$/i);
  if (slashRename) {
    return {
      intent: "rename_entity",
      ...(bookId ? { bookId } : {}),
      oldValue: slashRename[1]!.trim(),
      newValue: slashRename[2]!.trim(),
    };
  }

  const slashReplace = trimmed.match(/^\/replace\s+(\d+)\s+(.+?)\s*=>\s*(.+)$/i);
  if (slashReplace) {
    return {
      intent: "patch_chapter_text",
      ...(bookId ? { bookId } : {}),
      chapterNumber: parseInt(slashReplace[1]!, 10),
      targetText: slashReplace[2]!.trim(),
      replacementText: slashReplace[3]!.trim(),
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

  const zhRenameMatch = trimmed.match(/^把(.+?)改成(.+)$/);
  if (zhRenameMatch) {
    return {
      intent: "rename_entity",
      ...(bookId ? { bookId } : {}),
      oldValue: zhRenameMatch[1]!.trim(),
      newValue: zhRenameMatch[2]!.trim(),
    };
  }

  const enRenameMatch = trimmed.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
  if (enRenameMatch) {
    return {
      intent: "rename_entity",
      ...(bookId ? { bookId } : {}),
      oldValue: enRenameMatch[1]!.trim(),
      newValue: enRenameMatch[2]!.trim(),
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
