import { basename } from "node:path";
import readline from "node:readline/promises";
import {
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

export interface TuiFrameState {
  readonly projectName: string;
  readonly activeBookTitle?: string;
  readonly automationMode: AutomationMode;
  readonly status: ExecutionStatus;
}

export function renderTuiFrame(state: TuiFrameState): string {
  const lines = [
    `Project: ${state.projectName}`,
    `Book: ${state.activeBookTitle ?? "none"}`,
    `Mode: ${state.automationMode}`,
    `Stage: ${state.status}`,
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
  const boundSession = activeBookId && session.activeBookId !== activeBookId
    ? { ...session, activeBookId }
    : session;
  const request = routeNaturalLanguageIntent(input, {
    activeBookId: boundSession.activeBookId,
  });
  const result = await runInteractionRequest({
    session: boundSession,
    request,
    tools,
  });
  await persistProjectSession(projectRoot, result.session);
  return result;
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
    await processTuiInput(projectRoot, input, tools ?? await createInteractionTools(projectRoot));
  } finally {
    rl.close();
  }
}
