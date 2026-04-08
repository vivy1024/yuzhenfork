/* ── TUI animation effects ── */

import {
  c, bold, dim, italic,
  cyan, green, yellow, blue, magenta, red, gray, white,
  brightCyan, brightGreen, brightYellow, brightBlue, brightMagenta, brightWhite,
  bgCyan, bgBlue, bgMagenta, bgGreen, bgYellow, bgRed, bgGray,
  clearLine, hideCursor, showCursor, reset,
  badge, sleep, stripAnsi, box,
} from "./ansi.js";

/* ── Operation themes ── */

export interface OperationTheme {
  readonly icon: string;
  readonly color: string;
  readonly brightColor: string;
  readonly bg: string;
  readonly label: string;
  readonly frames: ReadonlyArray<string>;
}

const WAVE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PULSE_FRAMES = ["◜", "◠", "◝", "◞", "◡", "◟"];
const DOTS_FRAMES = ["·  ", "·· ", "···", " ··", "  ·", "   "];
const SCAN_FRAMES = ["▱▱▱▱▱", "▰▱▱▱▱", "▰▰▱▱▱", "▰▰▰▱▱", "▰▰▰▰▱", "▰▰▰▰▰", "▱▰▰▰▰", "▱▱▰▰▰", "▱▱▱▰▰", "▱▱▱▱▰"];
const WRITE_FRAMES = ["✎", "✎·", "✎··", "✎···", "✎····", "✎···", "✎··", "✎·"];

export const THEMES: Record<string, OperationTheme> = {
  thinking: {
    icon: "◇",
    color: cyan,
    brightColor: brightCyan,
    bg: bgCyan,
    label: "thinking",
    frames: DOTS_FRAMES,
  },
  writing: {
    icon: "✎",
    color: magenta,
    brightColor: brightMagenta,
    bg: bgMagenta,
    label: "writing",
    frames: WRITE_FRAMES,
  },
  auditing: {
    icon: "◉",
    color: yellow,
    brightColor: brightYellow,
    bg: bgYellow,
    label: "auditing",
    frames: SCAN_FRAMES,
  },
  revising: {
    icon: "✂",
    color: blue,
    brightColor: brightBlue,
    bg: bgBlue,
    label: "revising",
    frames: WAVE_FRAMES,
  },
  planning: {
    icon: "◈",
    color: cyan,
    brightColor: brightCyan,
    bg: bgCyan,
    label: "planning",
    frames: PULSE_FRAMES,
  },
  composing: {
    icon: "❖",
    color: green,
    brightColor: brightGreen,
    bg: bgGreen,
    label: "composing",
    frames: PULSE_FRAMES,
  },
  loading: {
    icon: "◌",
    color: gray,
    brightColor: white,
    bg: bgGray,
    label: "loading",
    frames: WAVE_FRAMES,
  },
};

/* ── Animated spinner with themed operations ── */

export class ThemedSpinner {
  private interval: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  private elapsed = 0;
  private theme: OperationTheme;

  constructor(themeName = "thinking") {
    this.theme = THEMES[themeName] ?? THEMES["thinking"]!;
  }

  start(label?: string): void {
    const displayLabel = label ?? this.theme.label;
    this.frame = 0;
    this.elapsed = 0;
    process.stdout.write(hideCursor);

    this.interval = setInterval(() => {
      this.elapsed += 120;
      const f = this.theme.frames[this.frame % this.theme.frames.length]!;
      const icon = c(this.theme.icon, this.theme.color);
      const anim = c(f, this.theme.brightColor);
      const text = c(displayLabel, dim);
      const time = this.elapsed >= 3000
        ? c(` ${formatElapsed(this.elapsed)}`, gray)
        : "";
      process.stdout.write(`${clearLine}  ${icon} ${text} ${anim}${time}`);
      this.frame++;
    }, 120);
  }

  update(label: string): void {
    if (!this.interval) return;
    this.stop();
    this.start(label);
  }

  succeed(message?: string): void {
    this.clear();
    if (message) {
      console.log(`  ${c("✓", brightGreen, bold)} ${message}`);
    }
  }

  fail(message?: string): void {
    this.clear();
    if (message) {
      console.log(`  ${c("✗", red, bold)} ${message}`);
    }
  }

  stop(): void {
    this.clear();
  }

  private clear(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    process.stdout.write(`${clearLine}${showCursor}`);
  }
}

/* ── Startup animation ── */

export async function animateStartup(version: string, projectName: string, bookTitle?: string): Promise<void> {
  const isTTY = process.stdout.isTTY;

  // Typing effect for logo
  const logoText = "InkOS";
  const tagline = "Autonomous Novel Writing AI Agent";

  if (isTTY) {
    console.log();
    process.stdout.write(hideCursor);

    // Draw box top
    process.stdout.write("  ╭" + "─".repeat(52) + "╮\n");

    // Animate logo typing
    process.stdout.write("  │  ");
    for (const char of logoText) {
      process.stdout.write(c(char, bold, brightCyan));
      await sleep(60);
    }
    process.stdout.write(c(` v${version}`, dim));
    const logoPad = 52 - 2 - logoText.length - ` v${version}`.length;
    process.stdout.write(" ".repeat(Math.max(0, logoPad)) + "│\n");

    // Animate tagline
    process.stdout.write("  │  ");
    for (let i = 0; i < tagline.length; i++) {
      process.stdout.write(c(tagline[i]!, dim));
      if (i % 3 === 0) await sleep(15);
    }
    const tagPad = 52 - 2 - tagline.length;
    process.stdout.write(" ".repeat(Math.max(0, tagPad)) + "│\n");

    // Box bottom
    process.stdout.write("  ╰" + "─".repeat(52) + "╯\n");
    process.stdout.write(showCursor);

    await sleep(200);
  } else {
    // Non-TTY fallback
    console.log();
    console.log(
      box([
        `  ${c("InkOS", bold, brightCyan)}${c(` v${version}`, dim)}`,
        `  ${c(tagline, dim)}`,
      ]),
    );
  }

  // Project info with fade-in effect
  console.log();
  if (isTTY) {
    await typewrite(`  ${c("◇", cyan)} ${c("Project", gray)}  ${c(projectName, brightWhite)}`, 8);
    await sleep(100);
    const bookDisplay = bookTitle
      ? c(bookTitle, brightWhite)
      : c("no book yet", dim);
    await typewrite(`  ${c("◇", cyan)} ${c("Book", gray)}     ${bookDisplay}`, 8);
    await sleep(100);
  } else {
    console.log(`  ${c("◇", cyan)} ${c("Project", gray)}  ${c(projectName, brightWhite)}`);
    const bookDisplay = bookTitle
      ? c(bookTitle, brightWhite)
      : c("no book yet", dim);
    console.log(`  ${c("◇", cyan)} ${c("Book", gray)}     ${bookDisplay}`);
  }

  console.log();
  console.log(c("  Type anything to start. /help for commands.", dim));
  console.log();
}

/* ── Typewriter effect ── */

async function typewrite(text: string, charDelay = 12): Promise<void> {
  const chars = text.split("");
  let i = 0;
  let insideEscape = false;

  for (const ch of chars) {
    process.stdout.write(ch);
    if (ch === "\x1b") insideEscape = true;
    if (insideEscape) {
      if (ch === "m") insideEscape = false;
      continue;
    }
    i++;
    if (i % 2 === 0) await sleep(charDelay);
  }
  process.stdout.write("\n");
}

/* ── Result display ── */

export function formatResultCard(content: string, intent?: string): string {
  const lines: string[] = [];

  if (intent) {
    const intentBadge = intentToBadge(intent);
    lines.push(`  ${intentBadge}`);
    lines.push("");
  }

  for (const line of content.split("\n")) {
    lines.push(`  ${line}`);
  }

  return lines.join("\n");
}

function intentToBadge(intent: string): string {
  const badges: Record<string, [string, string]> = {
    write_next: [" WRITE ", bgMagenta],
    revise_chapter: [" REVISE ", bgBlue],
    rewrite_chapter: [" REWRITE ", bgBlue],
    update_focus: [" FOCUS ", bgCyan],
    explain_status: [" STATUS ", bgGray],
    explain_failure: [" DEBUG ", bgRed],
    pause_book: [" PAUSE ", bgYellow],
    list_books: [" BOOKS ", bgGray],
    select_book: [" SELECT ", bgGreen],
    switch_mode: [" MODE ", bgCyan],
    rename_entity: [" RENAME ", bgYellow],
    patch_chapter_text: [" PATCH ", bgBlue],
    edit_truth: [" TRUTH ", bgGreen],
  };
  const [label, bg] = badges[intent] ?? [` ${intent.toUpperCase()} `, bgGray];
  return badge(label!, bg!);
}

/* ── Intent to spinner theme ── */

export function intentToTheme(intent: string): string {
  const map: Record<string, string> = {
    write_next: "writing",
    revise_chapter: "revising",
    rewrite_chapter: "revising",
    update_focus: "composing",
    explain_status: "loading",
    explain_failure: "thinking",
    pause_book: "loading",
    list_books: "loading",
    select_book: "loading",
    switch_mode: "loading",
    rename_entity: "composing",
    patch_chapter_text: "revising",
    edit_truth: "composing",
  };
  return map[intent] ?? "thinking";
}

/* ── Help display ── */

export function printStyledHelp(): void {
  const sections = [
    {
      title: "Writing",
      commands: [
        ["/write", "Write the next chapter (full pipeline)"],
        ["/rewrite <n>", "Rewrite chapter N from scratch"],
      ],
    },
    {
      title: "Navigation",
      commands: [
        ["/books", "List all books"],
        ["/open <book>", "Select active book"],
        ["/status", "Show current status"],
      ],
    },
    {
      title: "Control",
      commands: [
        ["/mode <auto|semi|manual>", "Switch automation mode"],
        ["/focus <text>", "Update current focus"],
      ],
    },
    {
      title: "Session",
      commands: [
        ["/clear", "Clear screen"],
        ["/help", "Show this help"],
        ["/quit", "Exit InkOS TUI"],
      ],
    },
  ];

  console.log();
  for (const section of sections) {
    console.log(`  ${c(section.title, bold, cyan)}`);
    for (const [cmd, desc] of section.commands) {
      const cmdStr = c(cmd!, green);
      const descStr = c(desc!, dim);
      const padding = " ".repeat(Math.max(1, 24 - stripAnsi(cmd!).length));
      console.log(`    ${cmdStr}${padding}${descStr}`);
    }
    console.log();
  }
  console.log(c("  Natural language also works:", dim));
  console.log(c('  "继续写" "写下一章" "暂停" "把林烬改成张三"', dim, italic));
  console.log();
}

/* ── Status display ── */

export function printStyledStatus(params: {
  readonly mode: string;
  readonly bookId?: string;
  readonly status: string;
  readonly events: ReadonlyArray<{ readonly kind: string; readonly detail?: string; readonly status: string }>;
}): void {
  const modeColors: Record<string, string> = {
    auto: green,
    semi: yellow,
    manual: blue,
  };
  const modeColor = modeColors[params.mode] ?? gray;
  const statusColors: Record<string, string> = {
    idle: gray,
    running: cyan,
    writing: magenta,
    auditing: yellow,
    completed: green,
    failed: red,
    waiting_human: brightYellow,
  };
  const statusColor = statusColors[params.status] ?? gray;

  console.log();
  console.log(`  ${c("◇", cyan)} ${c("Mode", gray)}     ${c(params.mode, modeColor, bold)}`);
  console.log(`  ${c("◇", cyan)} ${c("Book", gray)}     ${params.bookId ? c(params.bookId, brightWhite) : c("none", dim)}`);
  console.log(`  ${c("◇", cyan)} ${c("Status", gray)}   ${c(params.status, statusColor)}`);
  if (params.events.length > 0) {
    console.log(`  ${c("◇", cyan)} ${c("Recent", gray)}`);
    for (const ev of params.events.slice(-3)) {
      const icon = ev.status === "completed" ? c("✓", green) : c("·", gray);
      console.log(`        ${icon} ${c(`${ev.kind}`, dim)} ${c(ev.detail ?? "", gray)}`);
    }
  }
  console.log();
}

/* ── Utilities ── */

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}
