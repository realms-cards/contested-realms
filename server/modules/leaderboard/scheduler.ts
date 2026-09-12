"use strict";

/**
 * Runs the ladder replay on a fixed interval, shortly after startup, and
 * (debounced) whenever a match is recorded. Never runs concurrently: a
 * request that arrives mid-run marks the job dirty and it reruns once after.
 */

export interface LadderSchedulerDeps {
  run: () => Promise<unknown>;
  /** Skip an interval tick (not startup/requests) when this returns false. */
  shouldRunInterval?: () => Promise<boolean> | boolean;
  intervalMs?: number;
  startupDelayMs?: number;
  debounceMs?: number;
  log?: (message: string) => void;
}

export interface LadderScheduler {
  start(): void;
  stop(): void;
  requestRecompute(): void;
  runNow(): Promise<void>;
  isRunning(): boolean;
}

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 15_000;
const DEFAULT_DEBOUNCE_MS = 5_000;

export function createLadderScheduler(
  deps: LadderSchedulerDeps,
): LadderScheduler {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const startupDelayMs = deps.startupDelayMs ?? DEFAULT_STARTUP_DELAY_MS;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const log = deps.log ?? ((message: string) => console.log(message));

  let running: Promise<void> | null = null;
  let dirty = false;
  let debounceTimer: NodeJS.Timeout | null = null;
  let startupTimer: NodeJS.Timeout | null = null;
  let intervalTimer: NodeJS.Timeout | null = null;

  async function execute(): Promise<void> {
    try {
      await deps.run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`[ladder] recompute failed: ${message}`);
    }
  }

  function runNow(): Promise<void> {
    if (running) {
      dirty = true;
      return running;
    }
    running = (async () => {
      do {
        dirty = false;
        await execute();
      } while (dirty);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  function requestRecompute(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runNow();
    }, debounceMs);
  }

  async function intervalTick(): Promise<void> {
    if (deps.shouldRunInterval) {
      try {
        if (!(await deps.shouldRunInterval())) return;
      } catch {
        return;
      }
    }
    await runNow();
  }

  function start(): void {
    if (startupTimer || intervalTimer) return;
    startupTimer = setTimeout(() => {
      startupTimer = null;
      void runNow();
    }, startupDelayMs);
    intervalTimer = setInterval(() => {
      void intervalTick();
    }, intervalMs);
  }

  function stop(): void {
    if (startupTimer) clearTimeout(startupTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    startupTimer = null;
    intervalTimer = null;
    debounceTimer = null;
  }

  return {
    start,
    stop,
    requestRecompute,
    runNow,
    isRunning: () => running !== null,
  };
}
