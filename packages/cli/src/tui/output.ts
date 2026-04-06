import type { AutomationMode, ExecutionStatus, InteractionIntentType } from "@actalk/inkos-core";

export function formatTuiResult(params: {
  readonly intent: InteractionIntentType;
  readonly status: ExecutionStatus;
  readonly bookId?: string;
  readonly mode?: AutomationMode;
}): string {
  if (params.intent === "switch_mode" && params.mode) {
    return `Switched mode to ${params.mode}.`;
  }

  if (params.bookId) {
    return `Completed ${params.intent} for ${params.bookId}.`;
  }

  return `Completed ${params.intent}.`;
}
