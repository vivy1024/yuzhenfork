import type { AutomationMode } from "./modes.js";
import { routeInteractionRequest } from "./request-router.js";
import type { InteractionRequest } from "./intents.js";
import type { InteractionSession } from "./session.js";
import { appendInteractionEvent, bindActiveBook, updateAutomationMode } from "./session.js";

type ReviseMode = "local-fix" | "rewrite";

export interface InteractionRuntimeTools {
  readonly writeNextChapter: (bookId: string) => Promise<unknown>;
  readonly reviseDraft: (bookId: string, chapterNumber: number, mode: ReviseMode) => Promise<unknown>;
  readonly updateCurrentFocus: (bookId: string, content: string) => Promise<unknown>;
  readonly updateAuthorIntent: (bookId: string, content: string) => Promise<unknown>;
  readonly writeTruthFile: (bookId: string, fileName: string, content: string) => Promise<unknown>;
}

export interface InteractionRuntimeResult {
  readonly session: InteractionSession;
  readonly responseText?: string;
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
    status: "completed" | "blocked",
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
      await params.tools.writeNextChapter(bookId);
      session = bindActiveBook(session, bookId);
      const completed = markCompleted(session);
      return {
        session: addEvent(completed, "task.completed", "completed", `Completed write_next for ${bookId}.`),
        responseText: `Completed write_next for ${bookId}.`,
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
      await params.tools.reviseDraft(bookId, request.chapterNumber, mode);
      session = bindActiveBook(session, bookId, request.chapterNumber);
      const completed = markCompleted(session);
      return {
        session: addEvent(completed, "task.completed", "completed", `Completed ${request.intent} for ${bookId}.`),
        responseText: `Completed ${request.intent} for ${bookId}.`,
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
      await params.tools.updateCurrentFocus(bookId, request.instruction);
      session = bindActiveBook(session, bookId);
      const completed = markCompleted(session);
      return {
        session: addEvent(completed, "task.completed", "completed", `Updated current focus for ${bookId}.`),
        responseText: `Updated current focus for ${bookId}.`,
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
      await params.tools.updateAuthorIntent(bookId, request.instruction);
      session = bindActiveBook(session, bookId);
      const completed = markCompleted(session);
      return {
        session: addEvent(completed, "task.completed", "completed", `Updated author intent for ${bookId}.`),
        responseText: `Updated author intent for ${bookId}.`,
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
      await params.tools.writeTruthFile(bookId, request.fileName, request.instruction);
      session = bindActiveBook(session, bookId);
      const completed = markCompleted(session);
      return {
        session: addEvent(completed, "task.completed", "completed", `Updated ${request.fileName} for ${bookId}.`),
        responseText: `Updated ${request.fileName} for ${bookId}.`,
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
      const stage = session.currentExecution?.stageLabel ?? session.currentExecution?.status ?? "idle";
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
