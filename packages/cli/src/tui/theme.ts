export type TerminalTheme = "dark" | "light";

/**
 * Detect terminal background via $COLORFGBG (format: "fg;bg" or "fg;other;bg").
 * ANSI color indices 0-6 and 8 are dark; 7 and 9-15 are light.
 * Falls back to "dark" when the variable is missing or unparseable.
 */
export function detectTerminalTheme(): TerminalTheme {
  const raw = process.env.COLORFGBG;
  if (!raw) return "dark";
  const parts = raw.split(";");
  const bg = Number(parts[parts.length - 1]);
  if (Number.isNaN(bg)) return "dark";
  return bg <= 6 || bg === 8 ? "dark" : "light";
}

interface ThemePalette {
  readonly warmAccent: string;
  readonly warmMuted: string;
  readonly warmReply: string;
  readonly warmBorder: string;
  readonly statusSuccess: string;
  readonly statusError: string;
  readonly statusActive: string;
  readonly statusIdle: string;
  readonly roleUser: string;
  readonly roleSystem: string;
}

const darkPalette: ThemePalette = {
  warmAccent: "#d4a070",
  warmMuted: "#8f8374",
  warmReply: "#a8c4d4",
  warmBorder: "#6b6156",
  statusSuccess: "#7ec87e",
  statusError: "#e06060",
  statusActive: "#d4a76a",
  statusIdle: "#7a7268",
  roleUser: "#c0a480",
  roleSystem: "#b8a8d0",
};

const lightPalette: ThemePalette = {
  warmAccent: "#8b5e3c",
  warmMuted: "#7a6e62",
  warmReply: "#2a5a7a",
  warmBorder: "#b0a898",
  statusSuccess: "#2e7d32",
  statusError: "#c62828",
  statusActive: "#a06020",
  statusIdle: "#908478",
  roleUser: "#6b4c30",
  roleSystem: "#5c4a80",
};

const palette = detectTerminalTheme() === "light" ? lightPalette : darkPalette;

// Named exports for backward compatibility
export const WARM_ACCENT = palette.warmAccent;
export const WARM_MUTED = palette.warmMuted;
export const WARM_REPLY = palette.warmReply;
export const WARM_BORDER = palette.warmBorder;
export const STATUS_SUCCESS = palette.statusSuccess;
export const STATUS_ERROR = palette.statusError;
export const STATUS_ACTIVE = palette.statusActive;
export const STATUS_IDLE = palette.statusIdle;
export const ROLE_USER = palette.roleUser;
export const ROLE_SYSTEM = palette.roleSystem;
