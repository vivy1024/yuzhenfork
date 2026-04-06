import { Command } from "commander";

export interface TuiCommandHooks {
  readonly launchTui?: (projectRoot: string) => Promise<void> | void;
}

export function createTuiCommand(hooks: TuiCommandHooks = {}): Command {
  return new Command("tui")
    .description("Open the InkOS project workspace TUI")
    .action(async () => {
      await hooks.launchTui?.(process.cwd());
    });
}

