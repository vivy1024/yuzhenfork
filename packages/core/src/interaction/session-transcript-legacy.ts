import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BookSessionSchema, type BookSession } from "./session.js";
import {
  appendTranscriptEvent,
  legacyBookSessionPath,
  nextTranscriptSeq,
  readTranscriptEvents,
} from "./session-transcript.js";
import type { MessageEvent } from "./session-transcript-schema.js";

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export async function readLegacyBookSession(
  projectRoot: string,
  sessionId: string,
): Promise<BookSession | null> {
  try {
    const raw = await readFile(legacyBookSessionPath(projectRoot, sessionId), "utf-8");
    return BookSessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function migrateLegacyBookSessionToTranscript(
  projectRoot: string,
  session: BookSession,
): Promise<void> {
  const existing = await readTranscriptEvents(projectRoot, session.sessionId);
  if (existing.length > 0) return;

  let seq = await nextTranscriptSeq(projectRoot, session.sessionId);
  await appendTranscriptEvent(projectRoot, {
    type: "session_created",
    version: 1,
    sessionId: session.sessionId,
    seq: seq++,
    timestamp: session.createdAt,
    bookId: session.bookId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });

  const requestId = `legacy-${session.sessionId}`;
  await appendTranscriptEvent(projectRoot, {
    type: "request_started",
    version: 1,
    sessionId: session.sessionId,
    requestId,
    seq: seq++,
    timestamp: session.createdAt,
    input: "",
  });

  let parentUuid: string | null = null;
  for (const legacyMessage of session.messages) {
    const uuid = randomUUID();
    const message = legacyMessage.role === "assistant"
      ? {
          role: "assistant",
          content: [{ type: "text", text: legacyMessage.content }],
          api: "anthropic-messages",
          provider: "legacy",
          model: "unknown",
          usage: EMPTY_USAGE,
          stopReason: "stop",
          timestamp: legacyMessage.timestamp,
        }
      : {
          role: legacyMessage.role,
          content: legacyMessage.content,
          timestamp: legacyMessage.timestamp,
        };
    const event: MessageEvent = {
      type: "message",
      version: 1,
      sessionId: session.sessionId,
      requestId,
      uuid,
      parentUuid,
      seq: seq++,
      role: legacyMessage.role === "assistant" ? "assistant" : legacyMessage.role,
      timestamp: legacyMessage.timestamp,
      ...(legacyMessage.role === "assistant" && legacyMessage.thinking
        ? { legacyDisplay: { thinking: legacyMessage.thinking } }
        : {}),
      message,
    };
    await appendTranscriptEvent(projectRoot, event);
    parentUuid = uuid;
  }

  await appendTranscriptEvent(projectRoot, {
    type: "request_committed",
    version: 1,
    sessionId: session.sessionId,
    requestId,
    seq: seq++,
    timestamp: session.updatedAt,
  });
}
