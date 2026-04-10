import { appendInteractionEvent, appendInteractionMessage } from "./session.js";
import { routeNaturalLanguageIntent } from "./nl-router.js";
import type { InteractionRequest } from "./intents.js";
import type { InteractionRuntimeTools } from "./runtime.js";
import { runInteractionRequest } from "./runtime.js";
import {
  loadProjectSession,
  persistProjectSession,
  resolveSessionActiveBook,
} from "./project-session-store.js";

async function processProjectInteractionRequestInternal(params: {
  readonly projectRoot: string;
  readonly request: InteractionRequest;
  readonly tools: InteractionRuntimeTools;
  readonly activeBookId?: string;
}) {
  const session = await loadProjectSession(params.projectRoot);
  const restoredBookId = await resolveSessionActiveBook(params.projectRoot, session);
  const resolvedBookId = params.activeBookId ?? params.request.bookId ?? restoredBookId;
  const sessionWithBook = resolvedBookId && session.activeBookId !== resolvedBookId
    ? { ...session, activeBookId: resolvedBookId }
    : session;

  try {
    const result = await runInteractionRequest({
      session: sessionWithBook,
      request: params.request,
      tools: params.tools,
    });
    await persistProjectSession(params.projectRoot, result.session);
    return {
      ...result,
      request: params.request,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const failedSession = appendInteractionEvent({
      ...sessionWithBook,
      currentExecution: {
        status: "failed",
        bookId: sessionWithBook.activeBookId,
        chapterNumber: sessionWithBook.activeChapterNumber,
        stageLabel: `failed ${params.request.intent}`,
      },
    }, {
      kind: "task.failed",
      timestamp: Date.now(),
      status: "failed",
      bookId: sessionWithBook.activeBookId,
      chapterNumber: sessionWithBook.activeChapterNumber,
      detail,
    });
    await persistProjectSession(params.projectRoot, failedSession);
    throw error;
  }
}

export async function processProjectInteractionInput(params: {
  readonly projectRoot: string;
  readonly input: string;
  readonly tools: InteractionRuntimeTools;
  readonly activeBookId?: string;
}) {
  const session = await loadProjectSession(params.projectRoot);
  const restoredBookId = await resolveSessionActiveBook(params.projectRoot, session);
  const resolvedBookId = params.activeBookId ?? restoredBookId;
  const sessionWithBook = resolvedBookId && session.activeBookId !== resolvedBookId
    ? { ...session, activeBookId: resolvedBookId }
    : session;
  const userSession = appendInteractionMessage(sessionWithBook, {
    role: "user",
    content: params.input,
    timestamp: Date.now(),
  });
  const request = routeNaturalLanguageIntent(params.input, {
    activeBookId: userSession.activeBookId,
  });
  try {
    const result = await runInteractionRequest({
      session: userSession,
      request,
      tools: params.tools,
    });
    await persistProjectSession(params.projectRoot, result.session);
    return {
      ...result,
      request,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const failedSession = appendInteractionEvent({
      ...userSession,
      currentExecution: {
        status: "failed",
        bookId: userSession.activeBookId,
        chapterNumber: userSession.activeChapterNumber,
        stageLabel: `failed ${request.intent}`,
      },
    }, {
      kind: "task.failed",
      timestamp: Date.now(),
      status: "failed",
      bookId: userSession.activeBookId,
      chapterNumber: userSession.activeChapterNumber,
      detail,
    });
    await persistProjectSession(params.projectRoot, failedSession);
    throw error;
  }
}

export async function processProjectInteractionRequest(params: {
  readonly projectRoot: string;
  readonly request: InteractionRequest;
  readonly tools: InteractionRuntimeTools;
  readonly activeBookId?: string;
}) {
  return processProjectInteractionRequestInternal(params);
}
