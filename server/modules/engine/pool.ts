/**
 * Routes rules-engine matches to worker threads, and keeps each match pinned to one.
 *
 * A match's `GameState` lives inside exactly one worker (see worker.ts for why it may not live
 * anywhere a client can reach). That makes the pinning a correctness requirement, not a
 * performance one: an action sent to the wrong worker finds no match and is refused.
 *
 * Threads are used because legal-move generation is slow — measured p90 ~785ms and up to ~1.4s
 * per call on a fast core, because the generator trial-applies every candidate action. On the
 * main thread that stalls socket traffic for every other match on the instance.
 *
 * Follows bots/bot-worker-pool.js: an env var sizes it, 0 keeps everything in-process, and a
 * pool that cannot start degrades loudly to in-process rather than taking matches down.
 */
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { handle, type EngineReply, type EngineRequest } from "./worker";

const DEFAULT_MAX_WORKERS = 4;
const DISABLE_WORDS = new Set(["false", "off", "no", "none", "disable", "disabled"]);
const DEFAULT_WORDS = new Set(["true", "on", "yes", "auto", "default"]);
/** An action that has not answered by now is a hung card script, not a slow one. */
const REQUEST_TIMEOUT_MS = 15_000;

function availableCores(): number {
  return typeof os.availableParallelism === "function" ? os.availableParallelism() : (os.cpus() || []).length || 1;
}

/**
 * ENGINE_WORKERS: a decimal count; 0/false/off/no/none/disable(d) keeps the engine in-process;
 * unset/true/on/yes/auto/default uses the default. Mirrors CPU_BOT_WORKERS exactly so there is
 * one convention to remember.
 */
export function resolveWorkerCount(env: NodeJS.ProcessEnv = process.env, cores = availableCores()): number {
  const coreCount = Number.isInteger(cores) && cores > 0 ? cores : 1;
  const fallback = Math.max(1, Math.min(DEFAULT_MAX_WORKERS, coreCount - 1));
  const raw = env.ENGINE_WORKERS;
  const value = raw === undefined || raw === null ? "" : String(raw).trim().toLowerCase();
  if (value === "" || DEFAULT_WORDS.has(value)) return fallback;
  if (DISABLE_WORDS.has(value)) return 0;
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    if (n <= coreCount) return n;
    console.warn(`[EngineWorkers] ENGINE_WORKERS=${value} exceeds ${coreCount} core(s); capping at ${coreCount}`);
    return coreCount;
  }
  console.warn(`[EngineWorkers] Ignoring invalid ENGINE_WORKERS=${JSON.stringify(raw)}; using default (${fallback})`);
  return fallback;
}

type Pending = { resolve: (reply: EngineReply) => void; timer: NodeJS.Timeout };

class EngineWorker {
  private readonly thread: Worker;
  private readonly pending = new Map<number, Pending>();

  constructor(file: string) {
    this.thread = new Worker(file);
    this.thread.unref();
    this.thread.on("message", (reply: EngineReply) => {
      const waiting = this.pending.get(reply.id);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      this.pending.delete(reply.id);
      waiting.resolve(reply);
    });
    this.thread.on("error", (error) => this.failAll(String(error?.message ?? error)));
    this.thread.on("exit", () => this.failAll("The engine worker exited."));
  }

  private failAll(error: string) {
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.resolve({ id, ok: false, error });
    }
    this.pending.clear();
  }

  send(request: EngineRequest): Promise<EngineReply> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        resolve({ id: request.id, ok: false, error: "The engine did not answer in time." });
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(request.id, { resolve, timer });
      this.thread.postMessage(request);
    });
  }

  terminate() {
    void this.thread.terminate();
  }
}

export class EnginePool {
  private readonly workers: EngineWorker[] = [];
  private readonly owner = new Map<string, number>();
  private nextId = 0;
  private cursor = 0;
  /** True when no thread could be started and the engine is running on the event loop. */
  readonly inProcess: boolean;

  constructor(count = resolveWorkerCount()) {
    // In development the worker is still TypeScript and a thread cannot load it without a
    // loader, so run in-process there rather than build a fragile one.
    const compiled = path.join(__dirname, "worker.js");
    const canThread = count > 0 && existsSync(compiled);
    if (count > 0 && !canThread) {
      console.warn("[EngineWorkers] No compiled worker next to the pool; running the engine in-process.");
    }
    for (let i = 0; i < (canThread ? count : 0); i++) {
      try {
        this.workers.push(new EngineWorker(compiled));
      } catch (error) {
        console.warn("[EngineWorkers] Could not start a worker:", String((error as Error)?.message ?? error));
      }
    }
    this.inProcess = this.workers.length === 0;
  }

  /** Which worker owns this match, choosing one on first sight and never changing it. */
  private workerFor(matchId: string): EngineWorker | null {
    if (!this.workers.length) return null;
    let index = this.owner.get(matchId);
    if (index === undefined || !this.workers[index]) {
      index = this.cursor++ % this.workers.length;
      this.owner.set(matchId, index);
    }
    return this.workers[index];
  }

  private async run(request: Omit<EngineRequest, "id">, matchId: string): Promise<EngineReply> {
    const full = { ...request, id: ++this.nextId } as EngineRequest;
    const worker = this.workerFor(matchId);
    return worker ? worker.send(full) : handle(full);
  }

  create(matchId: string, decks: [unknown, unknown], names: [string, string], seed: number, first: 0 | 1) {
    return this.run({ kind: "create", matchId, decks, names, seed, first } as Omit<EngineRequest, "id">, matchId);
  }

  act(matchId: string, seat: 0 | 1, action: unknown) {
    return this.run({ kind: "act", matchId, seat, action } as Omit<EngineRequest, "id">, matchId);
  }

  view(matchId: string, seat: 0 | 1 | null) {
    return this.run({ kind: "view", matchId, seat } as Omit<EngineRequest, "id">, matchId);
  }

  /** The authoritative state, for persisting across a restart. Never send this to a client. */
  snapshot(matchId: string) {
    return this.run({ kind: "snapshot", matchId } as Omit<EngineRequest, "id">, matchId);
  }

  restore(matchId: string, state: unknown) {
    return this.run({ kind: "restore", matchId, state } as Omit<EngineRequest, "id">, matchId);
  }

  async drop(matchId: string) {
    const reply = await this.run({ kind: "drop", matchId } as Omit<EngineRequest, "id">, matchId);
    this.owner.delete(matchId);
    return reply;
  }

  shutdown() {
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.owner.clear();
  }
}
