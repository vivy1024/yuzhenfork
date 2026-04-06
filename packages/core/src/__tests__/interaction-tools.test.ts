import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLogger, type LogSink } from "../index.js";
import { createInteractionToolsFromDeps } from "../interaction/project-tools.js";

let projectRoot: string;

describe("interaction tools", () => {
  beforeAll(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "inkos-core-interaction-tools-"));
    await mkdir(join(projectRoot, "books", "harbor", "story"), { recursive: true });
  });

  it("delegates writeNextChapter and reviseDraft to the pipeline", async () => {
    const events: string[] = [];
    const sink: LogSink = {
      write(entry) {
        events.push(entry.message);
      },
    };
    const pipeline = {
      config: {
        logger: createLogger({ tag: "test", sinks: [sink] }),
      },
      writeNextChapter: vi.fn(async () => ({
        config: undefined,
        chapterNumber: 1,
        title: "Draft",
        wordCount: 1000,
        revised: false,
        status: "ready-for-review" as const,
        auditResult: { passed: true, issues: [], summary: "ok" },
      })),
      reviseDraft: vi.fn(async () => ({
        chapterNumber: 3,
        wordCount: 1200,
        fixedIssues: [],
        applied: true,
        status: "ready-for-review" as const,
      })),
    };
    const state = {
      ensureControlDocuments: vi.fn(async () => {}),
      bookDir: vi.fn((bookId: string) => join(projectRoot, "books", bookId)),
      loadChapterIndex: vi.fn(async () => []),
      saveChapterIndex: vi.fn(async () => undefined),
    };

    const tools = createInteractionToolsFromDeps(pipeline, state);

    const writeResult = await tools.writeNextChapter("harbor");
    await tools.reviseDraft("harbor", 3, "rewrite");

    expect(pipeline.writeNextChapter).toHaveBeenCalledWith("harbor");
    expect(pipeline.reviseDraft).toHaveBeenCalledWith("harbor", 3, "rewrite");
    expect((writeResult as { __interaction?: { activeChapterNumber?: number } }).__interaction?.activeChapterNumber).toBe(1);
    expect(events).toEqual([]);
  });

  it("captures pipeline stage logs into interaction events", async () => {
    const pipeline = {
      config: {
        logger: createLogger({
          tag: "test",
          sinks: [{
            write() {},
          }],
        }),
      },
      writeNextChapter: vi.fn(async function (this: { config: { logger?: { info: (msg: string) => void } } }) {
        this.config.logger?.info("Stage: preparing chapter inputs");
        this.config.logger?.info("Stage: writing chapter draft");
        return {
          chapterNumber: 4,
          title: "Draft",
          wordCount: 1000,
          revised: false,
          status: "ready-for-review" as const,
          auditResult: { passed: true, issues: [], summary: "ok" },
        };
      }),
      reviseDraft: vi.fn(async () => ({
        chapterNumber: 3,
        wordCount: 1200,
        fixedIssues: [],
        applied: true,
        status: "ready-for-review" as const,
      })),
    };
    const state = {
      ensureControlDocuments: vi.fn(async () => {}),
      bookDir: vi.fn((bookId: string) => join(projectRoot, "books", bookId)),
      loadChapterIndex: vi.fn(async () => []),
      saveChapterIndex: vi.fn(async () => undefined),
    };

    const tools = createInteractionToolsFromDeps(pipeline, state);
    const result = await tools.writeNextChapter("harbor");

    expect((result as {
      __interaction?: {
        events?: ReadonlyArray<{ kind: string; status: string; detail?: string }>;
      };
    }).__interaction?.events).toEqual([
      expect.objectContaining({ kind: "stage.changed", status: "planning", detail: "preparing chapter inputs" }),
      expect.objectContaining({ kind: "stage.changed", status: "writing", detail: "writing chapter draft" }),
    ]);
  });

  it("writes current_focus and author_intent into canonical story paths", async () => {
    const tools = createInteractionToolsFromDeps(
      {
        writeNextChapter: vi.fn(async () => ({
          chapterNumber: 1,
          title: "Draft",
          wordCount: 1000,
          revised: false,
          status: "ready-for-review" as const,
          auditResult: { passed: true, issues: [], summary: "ok" },
        })),
        reviseDraft: vi.fn(async () => ({
          chapterNumber: 3,
          wordCount: 1200,
          fixedIssues: [],
          applied: true,
          status: "ready-for-review" as const,
        })),
      },
      {
        ensureControlDocuments: vi.fn(async () => {}),
        bookDir: vi.fn((bookId: string) => join(projectRoot, "books", bookId)),
        loadChapterIndex: vi.fn(async () => []),
        saveChapterIndex: vi.fn(async () => undefined),
      },
    );

    await tools.updateCurrentFocus("harbor", "# Current Focus\n\nBring focus back.\n");
    await tools.updateAuthorIntent("harbor", "# Author Intent\n\nWrite a harbor mystery.\n");

    await expect(readFile(join(projectRoot, "books", "harbor", "story", "current_focus.md"), "utf-8"))
      .resolves.toContain("Bring focus back");
    await expect(readFile(join(projectRoot, "books", "harbor", "story", "author_intent.md"), "utf-8"))
      .resolves.toContain("harbor mystery");
  });
});
