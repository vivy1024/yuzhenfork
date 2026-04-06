import { appendInteractionMessage } from "./session.js";
import { routeNaturalLanguageIntent } from "./nl-router.js";
import type { InteractionRuntimeTools } from "./runtime.js";
import { runInteractionRequest } from "./runtime.js";
import {
  loadProjectSession,
  persistProjectSession,
  resolveSessionActiveBook,
} from "./project-session-store.js";

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
}
