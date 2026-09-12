import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLadderScheduler } from "../../../../server/modules/leaderboard/scheduler";

describe("ladder scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces bursts of recompute requests into one run", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = createLadderScheduler({
      run,
      debounceMs: 100,
      log: () => {},
    });
    scheduler.requestRecompute();
    scheduler.requestRecompute();
    scheduler.requestRecompute();
    await vi.advanceTimersByTimeAsync(99);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never runs concurrently and reruns once when dirtied mid-run", async () => {
    let release: () => void = () => {};
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const scheduler = createLadderScheduler({ run, log: () => {} });

    const first = scheduler.runNow();
    expect(scheduler.isRunning()).toBe(true);
    void scheduler.runNow();
    void scheduler.runNow();
    expect(run).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(run).toHaveBeenCalledTimes(2);
    expect(scheduler.isRunning()).toBe(false);
  });

  it("runs after the startup delay and then on the interval", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = createLadderScheduler({
      run,
      startupDelayMs: 50,
      intervalMs: 1000,
      log: () => {},
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(50);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("skips interval ticks when shouldRunInterval says no", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const scheduler = createLadderScheduler({
      run,
      startupDelayMs: 10,
      intervalMs: 100,
      shouldRunInterval: () => false,
      log: () => {},
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("swallows run failures", async () => {
    const log = vi.fn();
    const run = vi.fn().mockRejectedValue(new Error("boom"));
    const scheduler = createLadderScheduler({ run, log });
    await scheduler.runNow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});
