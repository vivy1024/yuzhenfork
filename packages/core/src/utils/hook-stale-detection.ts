/**
 * Phase 7 — stale / blocked hook detection.
 *
 * Runs per-chapter (called from the writer's runtime-state projection
 * pipeline when it emits pending_hooks.md). Tags hooks the reviewer and
 * writer-planner should pay attention to:
 *
 *   stale   — planted long ago (distance > half_life) and still not
 *             marked paid-off / resolved.
 *   blocked — depends_on references upstream hooks that are still
 *             unplanted or unresolved.
 *
 * The detection is pure: given the current hook list + current chapter
 * number, it returns a map of hook id -> diagnostic flags. Nothing is
 * persisted outside the rendered markdown.
 */

import type { StoredHook } from "../state/memory-db.js";
import type { HookRecord } from "../models/runtime-state.js";
import { resolveHalfLifeChapters } from "./hook-promotion.js";

export interface HookDiagnostics {
  readonly stale: boolean;
  readonly blocked: boolean;
  readonly missingUpstream: ReadonlyArray<string>;
  readonly distance: number;
  readonly halfLife: number;
}

type HookLike = StoredHook | HookRecord;

const RESOLVED_STATUSES: ReadonlyArray<RegExp> = [
  /^resolved$/i,
  /^closed$/i,
  /^done$/i,
  /^已回收$/,
  /^已解决$/,
];

function isResolved(hook: HookLike): boolean {
  const status = (hook.status ?? "").trim();
  return RESOLVED_STATUSES.some((pattern) => pattern.test(status));
}

export function computeHookDiagnostics(params: {
  readonly hooks: ReadonlyArray<HookLike>;
  readonly currentChapter: number;
}): Map<string, HookDiagnostics> {
  const { hooks, currentChapter } = params;
  const byId = new Map<string, HookLike>();
  for (const hook of hooks) {
    byId.set(hook.hookId, hook);
  }

  const result = new Map<string, HookDiagnostics>();

  for (const hook of hooks) {
    const halfLife = resolveHalfLifeChapters(hook as StoredHook);
    const plantedChapter = Math.max(0, hook.startChapter);
    const distance = Math.max(0, currentChapter - plantedChapter);

    // Stale: past half-life AND not resolved AND actually planted
    // (startChapter > 0 — a seed with startChapter 0 is a pre-planting seed).
    const stale = !isResolved(hook)
      && plantedChapter > 0
      && distance > halfLife;

    // Blocked: depends_on references a hook that is unplanted or unresolved.
    const missingUpstream: string[] = [];
    for (const upstreamId of hook.dependsOn ?? []) {
      const upstream = byId.get(upstreamId);
      if (!upstream) {
        missingUpstream.push(upstreamId);
        continue;
      }
      // Upstream is "planted but not delivered" if startChapter is non-zero
      // AND it's not resolved. An upstream that is still a seed (startChapter
      // 0) counts as unplanted.
      const upstreamResolved = isResolved(upstream);
      const upstreamPlanted = upstream.startChapter > 0
        && upstream.startChapter <= currentChapter;
      if (!upstreamPlanted || !upstreamResolved) {
        // We only block when the upstream genuinely has not cleared its gate.
        // For a pure "must be planted first" relationship, "planted but not
        // resolved" still counts as blocking the downstream from firing.
        missingUpstream.push(upstreamId);
      }
    }
    const blocked = missingUpstream.length > 0 && !isResolved(hook);

    result.set(hook.hookId, {
      stale,
      blocked,
      missingUpstream,
      distance,
      halfLife,
    });
  }

  return result;
}

/**
 * Render the diagnostic flags as a compact marker string suitable for
 * appending to an existing table cell. Empty when nothing is flagged.
 */
export function renderHookDiagnosticMarker(
  diagnostics: HookDiagnostics,
  language: "zh" | "en",
): string {
  const tokens: string[] = [];
  if (diagnostics.stale) {
    tokens.push(language === "en"
      ? `stale (d=${diagnostics.distance}/half=${diagnostics.halfLife})`
      : `过期 (距=${diagnostics.distance}/半衰=${diagnostics.halfLife})`);
  }
  if (diagnostics.blocked) {
    const missing = diagnostics.missingUpstream.join(", ");
    tokens.push(language === "en"
      ? `blocked on ${missing}`
      : `受阻于 ${missing}`);
  }
  return tokens.join("; ");
}
