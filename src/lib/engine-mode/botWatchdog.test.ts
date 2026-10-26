import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enginePrecons, toEngineDeck } from "./decks";
import { useEngineSession } from "./session";

/**
 * The computer's planner runs in a Web Worker. One that never answered (a hung search, or a worker
 * still running an older engine after a hot reload) left the computer "thinking" until the page was
 * reloaded. Now it is restarted once, and a second silence passes the turn.
 */
type Reply = { id: number; action?: unknown };
const workers: FakeWorker[] = [];
let answers = true;

class FakeWorker {
  onmessage: ((e: MessageEvent<Reply>) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  posted = 0;
  constructor() {
    workers.push(this);
  }
  postMessage(req: { id: number; state: string; seat: number }) {
    this.posted++;
    if (!answers) return; // stuck: never replies
    // keep the opening hand: the one move the computer needs before the game can start
    queueMicrotask(() => this.onmessage?.({ data: { id: req.id, action: { t: "keepHand" } } } as MessageEvent<Reply>));
  }
  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  workers.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  useEngineSession.getState().stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function startAndWaitForThePlanner() {
  await useEngineSession.getState().start(toEngineDeck(enginePrecons[0]), toEngineDeck(enginePrecons[1]), "quick");
  await vi.advanceTimersByTimeAsync(5_000); // past the computer's opening beat
}
const botWorkers = () => workers.filter((w) => w.posted > 0);

describe("the computer's planner watchdog", () => {
  it("restarts a planner that never answers, and the fresh one plays on", async () => {
    answers = false;
    await startAndWaitForThePlanner();
    expect(botWorkers()).toHaveLength(1);
    expect(useEngineSession.getState().botThinking).toBe(true);
    answers = true;
    await vi.advanceTimersByTimeAsync(20_000); // budget (1.5 s) + grace (15 s) has passed
    expect(botWorkers()[0].terminated, "the stuck planner was stopped").toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(botWorkers().length, "a fresh planner was asked").toBe(2);
    expect(useEngineSession.getState().game?.players[1].keptHand, "and its answer was played").toBe(true);
  });

  it("a second silence passes the turn and says so, instead of thinking forever", async () => {
    answers = false;
    await startAndWaitForThePlanner();
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(useEngineSession.getState().botThinking).toBe(false);
    expect(useEngineSession.getState().lastError).toMatch(/stopped responding/);
  });
});
