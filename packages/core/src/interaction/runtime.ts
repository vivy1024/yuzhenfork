import type { AutomationMode } from "./modes.js";
import { routeInteractionRequest } from "./request-router.js";
import type { InteractionRequest } from "./intents.js";
import type { ExecutionState, InteractionEvent } from "./events.js";
import type { PendingDecision, InteractionSession } from "./session.js";
import {
  appendInteractionEvent,
  bindActiveBook,
  clearPendingDecision,
  updateAutomationMode,
} from "./session.js";

type ReviseMode = "local-fix" | "rewrite";

export interface InteractionRuntimeTools {
  readonly writeNextChapter: (bookId: string) => Promise<unknown>;
  readonly reviseDraft: (bookId: string, chapterNumber: number, mode: ReviseMode) => Promise<unknown>;
  readonly patchChapterText: (
    bookId: string,
    chapterNumber: number,
    targetText: string,
    replacementText: string,
  ) => Promise<unknown>;
  readonly renameEntity: (
    bookId: string,
    oldValue: string,
    newValue: string,
  ) => Promise<unknown>;
  readonly updateCurrentFocus: (bookId: string, content: string) => Promise<unknown>;
  readonly updateAuthorIntent: (bookId: string, content: string) => Promise<unknown>;
  readonly writeTruthFile: (bookId: string, fileName: string, content: string) => Promise<unknown>;
}

export interface InteractionRuntimeResult {
  readonly session: InteractionSession;
  readonly responseText?: string;
}

interface InteractionToolMetadata {
  readonly events?: ReadonlyArray<InteractionEvent>;
  readonly activeChapterNumber?: number;
  readonly currentExecution?: ExecutionState;
  readonly pendingDecision?: PendingDecision;
  readonly responseText?: string;
}

function extractToolMetadata(value: unknown): InteractionToolMetadata {
  const chapterNumber = typeof value === "object" && value !== null && "chapterNumber" in value
    && typeof (value as { chapterNumber?: unknown }).chapterNumber === "number"
    ? (value as { chapterNumber: number }).chapterNumber
    : undefined;

  if (!value || typeof value !== "object" || !("__interaction" in value)) {
    return {
      ...(chapterNumber !== undefined ? { activeChapterNumber: chapterNumber } : {}),
    };
  }

  const interaction = (value as {
    readonly __interaction?: InteractionToolMetadata;
  }).__interaction;

  return {
    ...interaction,
    ...(interaction?.activeChapterNumber === undefined && chapterNumber !== undefined
      ? { activeChapterNumber: chapterNumber }
      : {}),
  };
}

function buildTaskStartedState(
  session: InteractionSession,
  request: InteractionRequest,
): ExecutionState {
  switch (request.intent) {
    case "write_next":
    case "continue_book":
      return {
        status: "planning",
        bookId: request.bookId ?? session.activeBookId,
        chapterNumber: session.activeChapterNumber,
        stageLabel: "preparing chapter inputs",
      };
    case "revise_chapter":
    case "rewrite_chapter":
      return {
        status: "repairing",
        bookId: request.bookId ?? session.activeBookId,
        chapterNumber: request.chapterNumber ?? session.activeChapterNumber,
        stageLabel: request.intent === "rewrite_chapter" ? "rewriting chapter" : "revising chapter",
      };
    case "update_focus":
    case "update_author_intent":
    case "edit_truth":
      return {
        status: "persisting",
        bookId: request.bookId ?? session.activeBookId,
        chapterNumber: session.activeChapterNumber,
        stageLabel: "applying project edit",
      };
    case "pause_book":
      return {
        status: "blocked",
        bookId: request.bookId ?? session.activeBookId,
        chapterNumber: session.activeChapterNumber,
        stageLabel: "paused by user",
      };
    default:
      return {
        status: "planning",
        bookId: request.bookId ?? session.activeBookId,
        chapterNumber: session.activeChapterNumber,
        stageLabel: `handling ${request.intent}`,
      };
  }
}

function shouldWaitForHuman(
  automationMode: AutomationMode,
  request: InteractionRequest,
): boolean {
  const contentIntent = request.intent === "write_next"
    || request.intent === "continue_book"
    || request.intent === "revise_chapter"
    || request.intent === "rewrite_chapter"
    || request.intent === "patch_chapter_text";
  const editIntent = request.intent === "update_focus"
    || request.intent === "update_author_intent"
    || request.intent === "edit_truth"
    || request.intent === "rename_entity";

  if (automationMode === "auto") {
    return false;
  }
  if (automationMode === "semi") {
    return contentIntent;
  }
  return contentIntent || editIntent;
}

function buildPendingDecision(
  session: InteractionSession,
  request: InteractionRequest,
  chapterNumber?: number,
): PendingDecision | undefined {
  if (!shouldWaitForHuman(session.automationMode, request)) {
    return undefined;
  }

  const bookId = request.bookId ?? session.activeBookId;
  if (!bookId) {
    return undefined;
  }

  return {
    kind: "review-next-step",
    bookId,
    ...(chapterNumber !== undefined ? { chapterNumber } : {}),
    summary: session.automationMode === "manual"
      ? "Execution finished. Choose the next action explicitly."
      : "Execution finished. Waiting for your next decision.",
  };
}

function buildWaitingExecution(
  session: InteractionSession,
  request: InteractionRequest,
  chapterNumber?: number,
): ExecutionState {
  return {
    status: "waiting_human",
    bookId: request.bookId ?? session.activeBookId,
    ...(chapterNumber !== undefined ? { chapterNumber } : {}),
    stageLabel: "waiting for your next decision",
  };
}

function appendToolEvents(
  session: InteractionSession,
  events: ReadonlyArray<InteractionEvent> | undefined,
): InteractionSession {
  if (!events || events.length === 0) {
    return session;
  }

  const baseTimestamp = Date.now();
  return events.reduce((nextSession, event, index) => appendInteractionEvent(nextSession, {
    ...event,
    timestamp: baseTimestamp - events.length + index,
  }), session);
}

export async function runInteractionRequest(params: {
  readonly session: InteractionSession;
  readonly request: InteractionRequest;
  readonly tools: InteractionRuntimeTools;
}): Promise<InteractionRuntimeResult> {
  const request = routeInteractionRequest(params.request);
  let session = params.session;
  const addEvent = (
    nextSession: InteractionSession,
    kind: string,
    status: InteractionEvent["status"],
    detail: string,
  ): InteractionSession => appendInteractionEvent(nextSession, {
    kind,
    timestamp: Date.now(),
    status,
    bookId: nextSession.activeBookId,
    chapterNumber: nextSession.activeChapterNumber,
    detail,
  });

  if (request.mode) {
    session = updateAutomationMode(session, request.mode as AutomationMode);
  }

  session = clearPendingDecision({
    ...session,
    currentExecution: buildTaskStartedState(session, request),
  });
  session = addEvent(session, "task.started", session.currentExecution!.status, `Started ${request.intent}.`);

  const markCompleted = (nextSession: InteractionSession): InteractionSession => ({
    ...nextSession,
    currentExecution: {
      status: "completed",
      bookId: nextSession.activeBookId,
      chapterNumber: nextSession.activeChapterNumber,
      stageLabel: "completed",
    },
  });

  switch (request.intent) {
    case "write_next":
    case "continue_book": {
      const bookId = request.bookId ?? session.activeBookId;
      if (!bookId) {
        throw new Error("No active book is bound to the interaction session.");
      }
      const toolResult = await params.tools.writeNextChapter(bookId);
      const metadata = extractToolMetadata(toolResult);
      session = bindActiveBook(session, bookId, metadata.activeChapterNumber);
      session = appendToolEvents(session, metadata.events);
      const pendingDecision = metadata.pendingDecision ?? buildPendingDecision(
        session,
        request,
        metadata.activeChapterNumber,
      );
      const completed = pendingDecision
        ? {
            ...session,
            pendingDecision,
            currentExecution: metadata.currentExecution ?? buildWaitingExecution(session, request, metadata.activeChapterNumber),
          }
        : {
            ...markCompleted(session),
            currentExecution: metadata.currentExecution ?? markCompleted(session).currentExecution,
          };
      return {
        session: addEvent(completed, "task.completed", "completed", `Completed write_next for ${bookId}.`),
        responseText: metadata.responseText ?? (
          pendingDecision
            ? `Completed write_next for ${bookId}; waiting for your next decision.`
            : `Completed write_next for ${bookId}.`
        ),
      };
    }
    case "revise_chapter":
    case "rewrite_chapter": {
      const bookId = request.bookId ?? session.activeBookId;
      if (!bookId) {
        throw new Error("No active book is bound to the interaction session.");
      }
      if (!request.chapterNumber) {
        throw new Error("Chapter number is required for chapter revision.");
      }
      const mode: ReviseMode = request.intent === "rewrite_chapter" ? "rewrite" : "local-fix";
      const toolResult = await params.tools.reviseDraft(bookId, request.chapterNumber, mode);
      const metadata = extractToolMetadata(toolResult);
      const chapterNumber = metadata.activeChapterNumber ?? request.chapterNumber;
      session = bindActiveBook(session, bookId, chapterNumber);
      session = appendToolEvents(session, metadata.events);
      const pendingDecision = metadata.pendingDecision ?? buildPendingDecision(
        session,
        request,
        chapterNumber,
      );
      const completed = pendingDecision
        ? {
            ...session,
            pendingDecision,
            currentExecution: metadata.currentExecution ?? buildWaitingExecution(session, request, chapterNumber),
          }
        : {
            ...markCompleted(session),
            currentExecution: metadata.currentExecution ?? markCompleted(session).currentExecution,
          };
      return {
        session: addEvent(completed, "task.completed", "completed", `Completed ${request.intent} for ${bookId}.`),
        responseText: metadata.responseText ?? (
          pendingDecision
            ? `Completed ${request.intent} for ${bookId}; waiting for your next decision.`
            : `Completed ${request.intent} for ${bookId}.`
        ),
      };
    }
    case "patch_chapter_text": {
      const bookId = request.bookId ?? session.activeBookId;
      if (!bookId) {
        throw new Error("No active book is bound to the interaction session.");
      }
      if (!request.chapterNumber || !request.targetText || !request.replacementText) {
        throw new Error("Chapter patch requires chapter number, target text, and replacement text.");
      }
      const toolResult = await params.tools.patchChapterText(
        bookId,
        request.chapterNumber,
        request.targetText,
        request.replacementText,
      );
      const metadata = extractToolMetadata(toolResult);
      const chapterNumber = metadata.activeChapterNumber ?? request.chapterNumber;
      session = bindActiveBook(session, bookId, chapterNumber);
      session = appendToolEvents(session, metadata.events);
      const pendingDecision = metadata.pendingDecision ?? buildPendingDecision(
        session,
        request,
        chapterNumber,
      );
      const completed = pendingDecision
        ? {
            ...session,
            pendingDecision,
            currentExecution: metadata.currentExecution ?? buildWaitingExecution(session, request, chapterNumber),
          }
        : {
            ...markCompleted(session),
            currentExecution: metadata.currentExecution ?? markCompleted(session).currentExecution,
          };
      return {
        session: addEvent(completed, "task.completed", "completed", `Patched chapter ${chapterNumber} for ${bookId}.`),
        responseText: metadata.responseText ?? (
          pendingDecision
            ? `Patched chapter ${chapterNumber} for ${bookId}; waiting for your next decision.`
            : `Patched chapter ${chapterNumber} for ${bookId}.`
        ),
      };
    }
    case "rename_entity": {
      const bookId = request.bookId ?? session.activeBookId;
      if (!bookId) {
        throw new Error("No active book is bound to the interaction session.");
      }
      if (!request.oldValue || !request.newValue) {
        throw new Error("Entity rename requires old and new values.");
      }
      const toolResult = await params.tools.renameEntity(bookId, request.oldValue, request.newValue);
      const metadata = extractToolMetadata(toolResult);
      session = bindActiveBook(session, bookId, metadata.activeChapterNumber);
      session = appendToolEvents(session, metadata.events);
      const pendingDecision = metadata.pendingDecision ?? buildPendingDecision(
        session,
        request,
        metadata.activeChapterNumber,
      );
      const completed = pendingDecision
        ? {
            ...session,
            pendingDecision,
            currentExecution: metadata.currentExecution ?? buildWaitingExecution(session, request, metadata.activeChapterNumber),
          }
        : {
            ...markCompleted(session),
            currentExecution: metadata.currentExecution ?? markCompleted(session).currentExecution,
          };
      return {
        session: addEvent(completed, "task.completed", "completed", `Renamed ${request.oldValue} to ${request.newValue} in ${bookId}.`),
        responseText: metadata.responseText ?? (
          pendingDecision
            ? `Renamed ${request.oldValue} to ${request.newValue} in ${bookId}; waiting for your next decision.`
            : `Renamed ${request.oldValue} to ${request.newValue} in ${bookId}.`
        ),
      };
    }
    case "update_focus": {
      const bookId = request.bookId ?? session.activeBookId;
      if (!bookId) {
        throw new Error("No active book is bound to the interaction session.");
      }
      if (!request.instruction) {
        throw new Error("Focus update requires instruction content.");
      }
      const toolResult = await params.tools.updateCurrentFocus(bookId, request.instruction);
      const metadata = extractToolMetadata(toolResult);
      session = bindActiveBook(session, bookId);
      session = appendToolEvents(session, metadata.events);
      const pendingDecision = metadata.pendingDecision ?? buildPendingDecision(session, request);
      const completed = pendingDecision
        ? {
            ...session,
            pendingDecision,
            currentExecution: metadata.currentExecution ?? buildWaitingExecution(session, request),
          }
        : {
            ...markCompleted(session),
            currentExecution: metadata.currentExecution ?? markCompleted(session).currentExecution,
          };
      return {
        session: addEvent(completed, "task.completed", "completed", `Updated current focus for ${bookId}.`),
        responseText: metadata.responseText ?? (
          pendingDecision
            ? `Updated current focus for ${bookId}; waiting for your next decision.`
            : `Updated current focus for ${bookId}.`
        ),
      };
    }
    case "update_author_intent": {
      const bookId = request.bookId ?? session.activeBookId;
      if (!bookId) {
        throw new Error("No active book is bound to the interaction session.");
      }
      if (!request.instruction) {
        throw new Error("Author intent update requires instruction content.");
      }
      const toolResult = await params.tools.updateAuthorIntent(bookId, request.instruction);
      const metadata = extractToolMetadata(toolResult);
      session = bindActiveBook(session, bookId);
      session = appendToolEvents(session, metadata.events);
      const pendingDecision = metadata.pendingDecision ?? buildPendingDecision(session, request);
      const completed = pendingDecision
        ? {
            ...session,
            pendingDecision,
            currentExecution: metadata.currentExecution ?? buildWaitingExecution(session, request),
          }
        : {
            ...markCompleted(session),
            currentExecution: metadata.currentExecution ?? markCompleted(session).currentExecution,
          };
      return {
        session: addEvent(completed, "task.completed", "completed", `Updated author intent for ${bookId}.`),
        responseText: metadata.responseText ?? (
          pendingDecision
            ? `Updated author intent for ${bookId}; waiting for your next decision.`
            : `Updated author intent for ${bookId}.`
        ),
      };
    }
    case "edit_truth": {
      const bookId = request.bookId ?? session.activeBookId;
      if (!bookId) {
        throw new Error("No active book is bound to the interaction session.");
      }
      if (!request.fileName || !request.instruction) {
        throw new Error("Truth-file edit requires a file name and content.");
      }
      const toolResult = await params.tools.writeTruthFile(bookId, request.fileName, request.instruction);
      const metadata = extractToolMetadata(toolResult);
      session = bindActiveBook(session, bookId);
      session = appendToolEvents(session, metadata.events);
      const pendingDecision = metadata.pendingDecision ?? buildPendingDecision(session, request);
      const completed = pendingDecision
        ? {
            ...session,
            pendingDecision,
            currentExecution: metadata.currentExecution ?? buildWaitingExecution(session, request),
          }
        : {
            ...markCompleted(session),
            currentExecution: metadata.currentExecution ?? markCompleted(session).currentExecution,
          };
      return {
        session: addEvent(completed, "task.completed", "completed", `Updated ${request.fileName} for ${bookId}.`),
        responseText: metadata.responseText ?? (
          pendingDecision
            ? `Updated ${request.fileName} for ${bookId}; waiting for your next decision.`
            : `Updated ${request.fileName} for ${bookId}.`
        ),
      };
    }
    case "switch_mode":
      session = markCompleted(session);
      return {
        session: addEvent(session, "task.completed", "completed", `Switched mode to ${session.automationMode}.`),
        responseText: `Switched mode to ${session.automationMode}.`,
      };
    case "pause_book": {
      const bookId = request.bookId ?? session.activeBookId;
      const paused = {
        ...session,
        currentExecution: {
          status: "blocked" as const,
          bookId,
          chapterNumber: session.activeChapterNumber,
          stageLabel: "paused by user",
        },
      };
      return {
        session: addEvent(paused, "task.completed", "blocked", `Paused ${bookId ?? "current book"}.`),
        responseText: `Paused ${bookId ?? "current book"}.`,
      };
    }
    case "resume_book": {
      const bookId = request.bookId ?? session.activeBookId;
      const resumed = {
        ...session,
        currentExecution: {
          status: "completed" as const,
          bookId,
          chapterNumber: session.activeChapterNumber,
          stageLabel: "ready to continue",
        },
      };
      return {
        session: addEvent(resumed, "task.completed", "completed", `Resumed ${bookId ?? "current book"}.`),
        responseText: `Resumed ${bookId ?? "current book"}.`,
      };
    }
    case "explain_status":
    case "explain_failure": {
      const bookId = request.bookId ?? session.activeBookId;
      const baselineExecution = params.session.currentExecution;
      const stage = baselineExecution?.stageLabel ?? baselineExecution?.status ?? "idle";
      const summary = request.intent === "explain_failure"
        ? `Current failure context: ${bookId ?? "no active book"} is at ${stage}.`
        : `Current status: ${bookId ?? "no active book"} is at ${stage}.`;
      const completed = markCompleted(session);
      return {
        session: addEvent(completed, "task.completed", "completed", summary),
        responseText: summary,
      };
    }
    default:
      throw new Error(`Intent "${request.intent}" is not implemented in the interaction runtime yet.`);
  }
}
