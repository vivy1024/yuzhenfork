import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createProjectSession,
  persistProjectSession,
} from "../interaction/project-session-store.js";
import { processProjectInteractionInput } from "../interaction/project-control.js";

let projectRoot: string;

describe("project interaction control", () => {
  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "inkos-project-control-"));
    await mkdir(join(projectRoot, "books", "harbor"), { recursive: true });
    await writeFile(join(projectRoot, "books", "harbor", "book.json"), "{}", "utf-8");
  });

  afterAll(async () => {
    // tmpdir cleanup omitted
  });

  it("routes continue through the persisted active book", async () => {
    await persistProjectSession(projectRoot, {
      ...createProjectSession(projectRoot),
      activeBookId: "harbor",
    });

    const tools = {
      writeNextChapter: vi.fn(async () => ({ ok: true })),
      reviseDraft: vi.fn(async () => ({ ok: true })),
      updateCurrentFocus: vi.fn(async () => ({ ok: true })),
      updateAuthorIntent: vi.fn(async () => ({ ok: true })),
      writeTruthFile: vi.fn(async () => ({ ok: true })),
    };

    const result = await processProjectInteractionInput({
      projectRoot,
      input: "continue",
      tools,
    });

    expect(tools.writeNextChapter).toHaveBeenCalledWith("harbor");
    expect(result.session.activeBookId).toBe("harbor");
    expect(result.request.intent).toBe("write_next");
  });

  it("persists mode switches in the project session", async () => {
    await persistProjectSession(projectRoot, {
      ...createProjectSession(projectRoot),
      activeBookId: "harbor",
    });

    const result = await processProjectInteractionInput({
      projectRoot,
      input: "切换到全自动",
      tools: {
        writeNextChapter: vi.fn(async () => ({ ok: true })),
        reviseDraft: vi.fn(async () => ({ ok: true })),
        updateCurrentFocus: vi.fn(async () => ({ ok: true })),
        updateAuthorIntent: vi.fn(async () => ({ ok: true })),
        writeTruthFile: vi.fn(async () => ({ ok: true })),
      },
    });

    expect(result.session.automationMode).toBe("auto");
  });
});
