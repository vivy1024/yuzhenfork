import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createProjectSession, persistProjectSession } from "../tui/session-store.js";
import { processTuiInput } from "../tui/app.js";

let projectRoot: string;

describe("tui control flow", () => {
  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "inkos-tui-control-"));
    await mkdir(join(projectRoot, "books", "harbor"), { recursive: true });
    await writeFile(join(projectRoot, "books", "harbor", "book.json"), "{}", "utf-8");
  });

  afterAll(async () => {
    // tmpdir cleanup omitted
  });

  it("routes continue through the active project book", async () => {
    await persistProjectSession(projectRoot, {
      ...createProjectSession(projectRoot),
      activeBookId: "harbor",
    });

    const tools = {
      writeNextChapter: vi.fn(async () => ({ ok: true })),
      reviseDraft: vi.fn(async () => ({ ok: true })),
      updateCurrentFocus: vi.fn(async () => ({ ok: true })),
      updateAuthorIntent: vi.fn(async () => ({ ok: true })),
    };

    const result = await processTuiInput(projectRoot, "continue", tools);

    expect(tools.writeNextChapter).toHaveBeenCalledWith("harbor");
    expect(result.session.activeBookId).toBe("harbor");
    expect(result.session.currentExecution?.status).toBe("completed");
    expect(result.session.messages.at(0)?.role).toBe("user");
    expect(result.session.messages.at(-1)?.role).toBe("assistant");
  });

  it("routes focus updates through the interaction runtime", async () => {
    await persistProjectSession(projectRoot, {
      ...createProjectSession(projectRoot),
      activeBookId: "harbor",
    });

    const tools = {
      writeNextChapter: vi.fn(async () => ({ ok: true })),
      reviseDraft: vi.fn(async () => ({ ok: true })),
      updateCurrentFocus: vi.fn(async () => ({ ok: true })),
      updateAuthorIntent: vi.fn(async () => ({ ok: true })),
    };

    await processTuiInput(projectRoot, "把 focus 拉回旧案线", tools);

    expect(tools.updateCurrentFocus).toHaveBeenCalledWith("harbor", "把 focus 拉回旧案线");
  });

  it("persists automation mode changes through the session", async () => {
    await persistProjectSession(projectRoot, {
      ...createProjectSession(projectRoot),
      activeBookId: "harbor",
    });

    const tools = {
      writeNextChapter: vi.fn(async () => ({ ok: true })),
      reviseDraft: vi.fn(async () => ({ ok: true })),
      updateCurrentFocus: vi.fn(async () => ({ ok: true })),
      updateAuthorIntent: vi.fn(async () => ({ ok: true })),
    };

    const result = await processTuiInput(projectRoot, "切换到全自动", tools);

    expect(result.session.automationMode).toBe("auto");
  });
});
