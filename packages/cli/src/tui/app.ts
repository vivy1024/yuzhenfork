import { basename } from "node:path";
import readline from "node:readline/promises";
import {
  appendInteractionMessage,
  routeNaturalLanguageIntent,
  runInteractionRequest,
  type AutomationMode,
  type ExecutionStatus,
  type InteractionRuntimeTools,
} from "@actalk/inkos-core";
import {
  createProjectSession,
  loadProjectSession,
  persistProjectSession,
  resolveSessionActiveBook,
} from "./session-store.js";
import { createInteractionTools } from "./tools.js";
import { formatTuiResult } from "./output.js";

export interface TuiFrameState {
  readonly projectName: string;
  readonly activeBookTitle?: string;
  readonly automationMode: AutomationMode;
  readonly status: ExecutionStatus;
  readonly messages?: ReadonlyArray<string>;
}

export function renderTuiFrame(state: TuiFrameState): string {
  const lines = [
    `Project: ${state.projectName}`,
    `Book: ${state.activeBookTitle ?? "none"}`,
    `Mode: ${state.automationMode}`,
    `Stage: ${state.status}`,
    "",
    "Messages:",
    ...(state.messages?.length
      ? state.messages.slice(-3).map((message) => `- ${message}`)
      : ["- (empty)"]),
    "",
    "> ",
  ];

  return lines.join("\n");
}

export async function processTuiInput(
  projectRoot: string,
  input: string,
  tools: InteractionRuntimeTools,
) {
  const session = await loadProjectSession(projectRoot);
  const activeBookId = await resolveSessionActiveBook(projectRoot, session);
  const sessionWithBook = activeBookId && session.activeBookId !== activeBookId
    ? { ...session, activeBookId }
    : session;
  const boundSession = appendInteractionMessage(sessionWithBook, {
    role: "user",
    content: input,
    timestamp: Date.now(),
  });
  const request = routeNaturalLanguageIntent(input, {
    activeBookId: boundSession.activeBookId,
  });
  const result = await runInteractionRequest({
    session: boundSession,
    request,
    tools,
  });
  const summary = formatTuiResult({
    intent: request.intent,
    status: result.session.currentExecution?.status ?? "completed",
    bookId: result.session.activeBookId,
    mode: request.mode,
  });
  const nextSession = appendInteractionMessage(result.session, {
    role: "assistant",
    content: summary,
    timestamp: Date.now(),
  });
  await persistProjectSession(projectRoot, nextSession);
  return { ...result, session: nextSession, request };
}

export async function launchTui(
  projectRoot: string,
  tools?: InteractionRuntimeTools,
): Promise<void> {
  const session = await loadProjectSession(projectRoot);
  const activeBookId = await resolveSessionActiveBook(projectRoot, session);
  const frame = renderTuiFrame({
    projectName: basename(projectRoot),
    activeBookTitle: activeBookId,
    automationMode: session.automationMode,
    status: session.currentExecution?.status ?? "idle",
    messages: session.messages.map((message) => `${message.role}: ${message.content}`),
  });

  process.stdout.write(frame);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const input = await rl.question("");
    if (!input.trim()) {
      return;
    }
    const result = await processTuiInput(projectRoot, input, tools ?? await createInteractionTools(projectRoot));
    process.stdout.write(`\n${result.session.messages.at(-1)?.content ?? ""}\n`);
  } finally {
    rl.close();
  }
}
