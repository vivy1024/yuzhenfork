/** Whether the terminal is macOS Terminal.app. */
export const isAppleTerminal = process.env.TERM_PROGRAM === "Apple_Terminal";

import { execSync } from "node:child_process";

type TerminalTheme = "dark" | "light";

/**
 * 1. $COLORFGBG (iTerm2, rxvt)
 * 2. macOS AppleInterfaceStyle (Terminal.app doesn't set COLORFGBG)
 * 3. Default: dark
 */
function detectTerminalTheme(): TerminalTheme {
  const raw = process.env.COLORFGBG;
  if (raw) {
    const parts = raw.split(";");
    const bg = Number(parts[parts.length - 1]);
    if (!Number.isNaN(bg)) {
      return bg <= 6 || bg === 8 ? "dark" : "light";
    }
  }
  if (process.platform === "darwin") {
    try {
      const result = execSync("defaults read -g AppleInterfaceStyle", {
        encoding: "utf8", timeout: 500, stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      return result === "Dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  }
  return "dark";
}

const isDark = detectTerminalTheme() === "dark";

// Dark theme (original main-branch values)
export const WARM_ACCENT = isDark ? "#c88a56" : "#8b5e3c";
export const WARM_MUTED = isDark ? "#8f8374" : "#7a6e62";
export const WARM_REPLY = isDark ? "#f0e6d8" : "#2a4a6a";
export const WARM_BORDER = isDark ? "#6b6156" : "#b0a898";
export const STATUS_SUCCESS = isDark ? "#7ec87e" : "#2e7d32";
export const STATUS_ERROR = isDark ? "#e06060" : "#c62828";
export const STATUS_ACTIVE = isDark ? "#d4a76a" : "#a06020";
export const STATUS_IDLE = isDark ? "#7a7268" : "#908478";
export const ROLE_USER = isDark ? "#a8c4d4" : "#3a6a8a";
export const ROLE_SYSTEM = isDark ? "#b8a8d0" : "#5c4a80";
