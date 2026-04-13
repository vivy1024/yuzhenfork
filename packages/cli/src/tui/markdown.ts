import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

const marked = new Marked();
marked.use(markedTerminal({
  width: Math.min(process.stdout.columns ?? 80, 100) - 8,
  reflowText: true,
  showSectionPrefix: false,
  tab: 2,
}) as never);

export function renderMarkdown(text: string): string {
  try {
    const rendered = marked.parse(text);
    if (typeof rendered !== "string") {
      return text;
    }
    // marked-terminal adds trailing newlines; trim them
    return rendered.replace(/\n+$/, "");
  } catch {
    return text;
  }
}
