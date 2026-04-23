import type { InkosProvider } from "./types.js";
import { ANTHROPIC } from "./anthropic.js";
import { OPENAI } from "./openai.js";
import { GOOGLE } from "./google.js";
import { DEEPSEEK } from "./deepseek.js";
import { QWEN } from "./qwen.js";
import { MINIMAX } from "./minimax.js";

export type { InkosProvider, InkosModel, ApiProtocol } from "./types.js";

/**
 * 所有已注册 provider 的扁平列表。顺序定义了 lookup Layer 2 的遍历顺序，
 * 但 Layer 2 还会按 PROVIDER_PRIORITY 显式排序，所以此处顺序不影响结果。
 */
const ALL_PROVIDERS: readonly InkosProvider[] = [
  ANTHROPIC,
  OPENAI,
  GOOGLE,
  DEEPSEEK,
  QWEN,
  MINIMAX,
];

const PROVIDERS_BY_ID: Map<string, InkosProvider> = new Map(
  ALL_PROVIDERS.map((p) => [p.id, p]),
);

export function getAllProviders(): readonly InkosProvider[] {
  return ALL_PROVIDERS;
}

export function getProvider(id: string): InkosProvider | undefined {
  return PROVIDERS_BY_ID.get(id);
}
