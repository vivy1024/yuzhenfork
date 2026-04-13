import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { isAppleTerminal } from "./theme.js";

const marked = new Marked();
marked.use(markedTerminal({
  width: Math.min(process.stdout.columns ?? 80, 100) - 8,
  reflowText: true,
  showSectionPrefix: false,
  tab: 2,
  // Preserve inline formatting through reflow: keep ** markers as plain text
  // so reflowText won't split ANSI codes across lines. Post-process converts them.
  listitem: (text: string) => text,
  strong: (text: string) => `**${text}**`,
  // cli-table3 defaults table headers to red; disable to inherit parent color
  tableOptions: { style: { head: [] } },
}) as never);

const BOLD_ON = "\x1b[1m";
const BOLD_OFF = "\x1b[22m";

/**
 * Post-process marked-terminal output:
 * 1. Strip \x1b[0m (full reset) that overrides Ink's <Text color>
 * 2. Replace `* ` bullets with `· `
 * 3. Convert `**text**` markers to ANSI bold
 */
function postProcess(text: string): string {
  return text
    .replace(/\x1b\[0m/g, "")
    .replace(/^(\s*)\* /gm, "$1· ")
    .replace(/\*\*(.+?)\*\*/g, `${BOLD_ON}$1${BOLD_OFF}`);
}

/**
 * Lightweight plain-text markdown for Terminal.app.
 * Strips all ANSI codes to avoid triggering CoreGraphics crashes
 * (Terminal.app misinterprets UTF-8 bytes as color space pointers).
 */
function renderPlain(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^(\s*)[-*]\s/gm, "$1· ");
}

export function renderMarkdown(text: string): string {
  // Terminal.app crashes when ANSI escape codes + CJK text hit its
  // CoreGraphics rendering pipeline. Use plain text as a workaround.
  if (isAppleTerminal) {
    return renderPlain(text);
  }

  try {
    const rendered = marked.parse(text);
    if (typeof rendered !== "string") {
      return text;
    }
    return postProcess(rendered.replace(/\n+$/, ""));
  } catch {
    return text;
  }
}
