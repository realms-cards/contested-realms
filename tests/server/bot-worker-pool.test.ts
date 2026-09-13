// @vitest-environment node
import { createServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { Server } from "socket.io";
import type { Socket } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

interface PooledBot {
  playerId: string;
  hostedIn: "worker" | "in-process" | null;
  start(): Promise<void>;
  stop(): void;
  onUnexpectedExit(listener: (reason: string) => void): () => void;
}
type BotOptions = {
  serverUrl: string;
  displayName?: string;
  playerId?: string;
  lobbyId?: string;
  botSecret?: string;
};
interface WorkerStats {
  threadId: number;
  bots: number;
  cardIdMapEntries: number;
}
interface PoolStats {
  size: number;
  disabled: boolean;
  closed: boolean;
  spawned: number;
  exited: number;
  workers: Array<{ id: number; threadId: number; ready: boolean; bots: number }>;
}
interface PoolOptions {
  size?: number;
  workerPath?: string;
  idleTimeoutMs?: number;
  fallbackBotClient?: new (opts: BotOptions) => { start(): Promise<void>; stop(): void };
  getCardIdMap?: () => Record<string, unknown> | null;
  enableTestHooks?: boolean;
}
interface Pool {
  BotClient: new (opts: BotOptions) => PooledBot;
  syncCardIdMap(map?: Record<string, unknown> | null): boolean;
  ping(): Promise<WorkerStats>;
  inspectWorkers(): Promise<WorkerStats[]>;
  stats(): PoolStats;
  shutdown(): Promise<void>;
  __testBusyLoop(ms: number): Promise<{ elapsedMs: number; spins: number }>;
  __testCrashWorkerOf(bot: PooledBot, code?: number): void;
}
interface PoolModule {
  BotWorkerPool: new (opts: PoolOptions) => Pool;
  resolveWorkerCount(env: Record<string, string | undefined>, cores?: number): number;
}
interface PlayerRecord {
  socketId: string | null;
  lobbyId: string | null;
  matchId: string | null;
}
interface BotManagerLike {
  registerBot(botId: string, bot: PooledBot): void;
  getBot(botId: string): PooledBot | null;
  stopAndRemoveBot(botId: string, reason?: string): void;
}
interface BotManagerModule {
  BotManager: new (
    io: Server,
    players: Map<string, PlayerRecord>,
    lobbies: Map<string, unknown>,
    matches: Map<string, unknown>,
    getLobbyInfo: (lobby: unknown) => unknown,
    getMatchInfo: (match: unknown) => unknown,
  ) => BotManagerLike;
}
interface HelloRecord {
  socket: Socket;
  auth: Record<string, unknown>;
  payload: { displayName?: string; playerId?: string };
}

const requireCjs = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workerPath = path.join(repoRoot, "bots", "bot-worker.js");
const { BotWorkerPool, resolveWorkerCount }: PoolModule = requireCjs(
  path.join(repoRoot, "bots", "bot-worker-pool.js"),
);
const { BotManager }: BotManagerModule = requireCjs(path.join(repoRoot, "server", "botManager.js"));

const SECRET = "test-bot-secret-7f3a";
const CARD_MAP = {
  "arid desert": { cardId: 1, variantId: 10 },
  "spire": { cardId: 2, variantId: null },
};

const pools: Pool[] = [];
const servers: Array<{ io: Server; http: HttpServer }> = [];

function trackPool(opts: PoolOptions): Pool {
  const pool = new BotWorkerPool(opts);
  pools.push(pool);
  return pool;
}

async function waitFor(check: () => boolean, timeoutMs = 10000, label = "condition"): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function startTestServer() {
  const http = createServer();
  const io = new Server(http, { transports: ["websocket"] });
  const hellos: HelloRecord[] = [];
  io.on("connection", (socket) => {
    const auth = { ...(socket.handshake.auth as Record<string, unknown>) };
    socket.on("hello", (payload: HelloRecord["payload"]) => {
      hellos.push({ socket, auth, payload });
    });
  });
  // Dual-stack listen so "localhost" works whether it resolves to ::1 or 127.0.0.1 (as in the server).
  await new Promise<void>((resolve) => http.listen(0, resolve));
  servers.push({ io, http });
  const { port } = http.address() as AddressInfo;
  const waitForHello = async (playerId: string): Promise<HelloRecord> => {
    await waitFor(() => hellos.some((h) => h.payload.playerId === playerId), 10000, `hello from ${playerId}`);
    const found = hellos.find((h) => h.payload.playerId === playerId);
    if (!found) throw new Error("hello vanished");
    return found;
  };
  return { io, serverUrl: `http://localhost:${port}`, waitForHello };
}

function onceDisconnected(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    if (socket.disconnected) resolve("already");
    else socket.once("disconnect", (reason) => resolve(String(reason)));
  });
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.shutdown()));
  await Promise.all(
    servers.splice(0).map(({ io }) => new Promise<void>((resolve) => io.close(() => resolve()))),
  );
});

describe("resolveWorkerCount", () => {
  it("honours CPU_BOT_WORKERS and defaults to 1..4", () => {
    expect(resolveWorkerCount({ CPU_BOT_WORKERS: "0" })).toBe(0);
    expect(resolveWorkerCount({ CPU_BOT_WORKERS: "3" }, 8)).toBe(3);
    const def = resolveWorkerCount({});
    expect(def).toBeGreaterThanOrEqual(1);
    expect(def).toBeLessThanOrEqual(4);
    expect([1, 2, 3, 8, 64].map((cores) => resolveWorkerCount({}, cores))).toEqual([1, 1, 2, 4, 4]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveWorkerCount({ CPU_BOT_WORKERS: "lots" })).toBe(def);
    warn.mockRestore();
  });

  it("treats disable words as 0 and enable words as the default, without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const v of ["false", "OFF", " no ", "none", "disable", "Disabled", "00"]) {
      expect(resolveWorkerCount({ CPU_BOT_WORKERS: v }, 8), v).toBe(0);
    }
    for (const v of ["", "  ", "true", "On", "yes", "auto", "default"]) {
      expect(resolveWorkerCount({ CPU_BOT_WORKERS: v }, 8), v).toBe(4);
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("caps explicit counts at the core count and rejects non-decimal forms", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveWorkerCount({ CPU_BOT_WORKERS: "8" }, 8)).toBe(8);
    expect(warn).not.toHaveBeenCalled();
    expect(resolveWorkerCount({ CPU_BOT_WORKERS: "999" }, 8)).toBe(8);
    expect(resolveWorkerCount({ CPU_BOT_WORKERS: "2" }, 1)).toBe(1);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockClear();
    const invalid = ["1e1", "0x2", "-1", "2.5", "1.0", "+2", "Infinity"];
    for (const v of invalid) {
      expect(resolveWorkerCount({ CPU_BOT_WORKERS: v }, 8), v).toBe(4);
    }
    expect(warn).toHaveBeenCalledTimes(invalid.length);
    warn.mockRestore();
  });
});

describe("BotWorkerPool", () => {
  it("hosts a BotClient in a worker: connects with hello, ships card map, stops cleanly", { timeout: 30000 }, async () => {
    const server = await startTestServer();
    let fallbackConstructed = 0;
    class UnexpectedFallback {
      constructor() {
        fallbackConstructed++;
      }
      async start() {}
      stop() {}
    }
    const pool = trackPool({
      size: 2,
      workerPath,
      idleTimeoutMs: 50,
      fallbackBotClient: UnexpectedFallback,
      getCardIdMap: () => CARD_MAP,
    });
    const bot = new pool.BotClient({
      serverUrl: server.serverUrl,
      displayName: "Worker Bot",
      playerId: "cpu_worker_1",
      lobbyId: "lobby_test",
      botSecret: SECRET,
    });
    // botSecret is never on a loggable/serialisable property of the proxy.
    expect(inspect(bot, { depth: 5 })).not.toContain(SECRET);
    expect(JSON.stringify(bot)).not.toContain(SECRET);

    await bot.start();
    expect(bot.hostedIn).toBe("worker");
    const hello = await server.waitForHello("cpu_worker_1");
    expect(hello.payload.displayName).toBe("[CPU] Worker Bot");
    expect(hello.auth.botSecret).toBe(SECRET);
    expect(hello.auth.playerId).toBe("cpu_worker_1");

    const workers = await pool.inspectWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0].bots).toBe(1);
    expect(workers[0].cardIdMapEntries).toBe(2);
    expect(workers[0].threadId).toBeGreaterThan(0);

    const disconnected = onceDisconnected(hello.socket);
    bot.stop();
    bot.stop(); // idempotent
    await disconnected;
    await waitFor(() => pool.stats().exited === 1 && pool.stats().workers.length === 0, 5000, "idle worker exit");
    expect(pool.stats().spawned).toBe(1);
    expect(fallbackConstructed).toBe(0);
  });

  it("ships a late-loaded card map to running workers and assigns least-loaded workers", { timeout: 30000 }, async () => {
    const server = await startTestServer();
    let map: Record<string, unknown> | null = null;
    const pool = trackPool({ size: 2, workerPath, getCardIdMap: () => map });
    const a = new pool.BotClient({ serverUrl: server.serverUrl, playerId: "cpu_late_a", botSecret: SECRET });
    await a.start();
    await server.waitForHello("cpu_late_a");
    expect((await pool.inspectWorkers()).map((w) => w.cardIdMapEntries)).toEqual([0]);

    map = CARD_MAP;
    expect(pool.syncCardIdMap()).toBe(true);
    expect(pool.syncCardIdMap()).toBe(false); // same map is not re-shipped
    expect((await pool.inspectWorkers()).map((w) => w.cardIdMapEntries)).toEqual([2]);

    const b = new pool.BotClient({ serverUrl: server.serverUrl, playerId: "cpu_late_b", botSecret: SECRET });
    const c = new pool.BotClient({ serverUrl: server.serverUrl, playerId: "cpu_late_c", botSecret: SECRET });
    await b.start();
    await c.start();
    await Promise.all(["cpu_late_b", "cpu_late_c"].map((id) => server.waitForHello(id)));
    const stats = await pool.inspectWorkers();
    expect(stats).toHaveLength(2);
    expect(stats.map((w) => w.bots).sort()).toEqual([1, 2]);
    expect(stats.every((w) => w.cardIdMapEntries === 2)).toBe(true);
    [a, b, c].forEach((bot) => bot.stop());
  });

  it("cleans up every bot through BotManager when its worker crashes, then replaces the worker", { timeout: 30000 }, async () => {
    const server = await startTestServer();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const pool = trackPool({ size: 1, workerPath, idleTimeoutMs: 50, enableTestHooks: true });
      const players = new Map<string, PlayerRecord>();
      const manager = new BotManager(server.io, players, new Map(), new Map(), (l) => l, (m) => m);
      const removeSpy = vi.spyOn(manager, "stopAndRemoveBot");

      const ids = ["cpu_crash_1", "cpu_crash_2"];
      const bots = ids.map((id) => new pool.BotClient({ serverUrl: server.serverUrl, playerId: id, botSecret: SECRET }));
      bots.forEach((bot, i) => manager.registerBot(ids[i], bot));
      await Promise.all(bots.map((bot) => bot.start()));
      const hellos = await Promise.all(ids.map((id) => server.waitForHello(id)));
      hellos.forEach((h, i) => players.set(ids[i], { socketId: h.socket.id, lobbyId: null, matchId: null }));
      expect(pool.stats().workers).toHaveLength(1);
      expect(pool.stats().workers[0].bots).toBe(2);
      const crashedThread = pool.stats().workers[0].threadId;

      const disconnects = hellos.map((h) => onceDisconnected(h.socket));
      pool.__testCrashWorkerOf(bots[0], 70);
      await waitFor(() => removeSpy.mock.calls.length === 2, 5000, "crash cleanup");
      expect(removeSpy.mock.calls.map((call) => call[0]).sort()).toEqual(ids);
      expect(removeSpy.mock.calls.every((call) => call[1] === "worker_crashed")).toBe(true);
      ids.forEach((id) => {
        expect(manager.getBot(id)).toBeNull();
        expect(players.has(id)).toBe(false);
      });
      await Promise.all(disconnects);
      expect(pool.stats().workers).toHaveLength(0);
      expect(pool.stats().exited).toBe(1);

      // The pool replaces the dead worker for future bots.
      const next = new pool.BotClient({ serverUrl: server.serverUrl, playerId: "cpu_after_crash", botSecret: SECRET });
      manager.registerBot("cpu_after_crash", next);
      await next.start();
      await server.waitForHello("cpu_after_crash");
      expect(pool.stats().spawned).toBe(2);
      expect(pool.stats().workers[0].threadId).not.toBe(crashedThread);

      manager.stopAndRemoveBot("cpu_after_crash", "match_ended");
      // _terminate drops the record before the worker's 'exit' event bumps the exited count.
      await waitFor(() => pool.stats().workers.length === 0 && pool.stats().exited === 2, 5000, "idle termination");
      expect(pool.stats().exited).toBe(2);
      await new Promise((r) => setTimeout(r, 50));
      expect(removeSpy).toHaveBeenCalledTimes(3); // no duplicate cleanup
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      errorLog.mockRestore();
    }
  });

  it("rejects start() when the worker dies before the bot starts, or falls back in-process", { timeout: 30000 }, async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const missing = path.join(repoRoot, "bots", "does-not-exist-worker.js");
      const noFallback = trackPool({ size: 1, workerPath: missing });
      const doomed = new noFallback.BotClient({ serverUrl: "http://localhost:1", playerId: "cpu_doomed" });
      await expect(doomed.start()).rejects.toThrow(/exited before bot start/);
      expect(noFallback.stats().workers).toHaveLength(0);

      const events: string[] = [];
      class FakeInProcessBot {
        opts: BotOptions;
        constructor(opts: BotOptions) {
          this.opts = opts;
          events.push(`new:${opts.playerId}:${opts.botSecret === SECRET}`);
        }
        async start() {
          events.push(`start:${this.opts.playerId}`);
        }
        stop() {
          events.push(`stop:${this.opts.playerId}`);
        }
      }
      const withFallback = trackPool({ size: 1, workerPath: missing, fallbackBotClient: FakeInProcessBot });
      for (const id of ["cpu_fb_1", "cpu_fb_2", "cpu_fb_3", "cpu_fb_4"]) {
        const bot = new withFallback.BotClient({ serverUrl: "http://localhost:1", playerId: id, botSecret: SECRET });
        await bot.start();
        expect(bot.hostedIn).toBe("in-process");
        bot.stop();
      }
      expect(events).toContain("new:cpu_fb_1:true");
      expect(events).toContain("stop:cpu_fb_4");
      // Three consecutive boot failures disable workers; the fourth bot never spawns one.
      expect(withFallback.stats().disabled).toBe(true);
      expect(withFallback.stats().spawned).toBe(3);
    } finally {
      errorLog.mockRestore();
      warnLog.mockRestore();
    }
  });
});

describe("BotWorkerPool isolation", () => {
  async function measureLag<T>(task: () => Promise<T>) {
    const intervalMs = 10;
    let last = performance.now();
    let maxLagMs = 0;
    let ticks = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      maxLagMs = Math.max(maxLagMs, now - last - intervalMs);
      last = now;
      ticks++;
    }, intervalMs);
    try {
      const result = await task();
      // Let a tick land after the task so a blocked loop is actually observed.
      await new Promise((r) => setTimeout(r, intervalMs * 3));
      return { result, maxLagMs, ticks };
    } finally {
      clearInterval(timer);
    }
  }

  it("keeps the main event loop responsive while a worker burns CPU for ~500ms", { timeout: 30000 }, async () => {
    const pool = trackPool({ size: 1, workerPath, enableTestHooks: true });
    await pool.__testBusyLoop(1); // boot the worker outside the measurement

    const inWorker = await measureLag(() => pool.__testBusyLoop(500));
    expect(inWorker.result.elapsedMs).toBeGreaterThanOrEqual(500);
    expect(inWorker.ticks).toBeGreaterThanOrEqual(25);
    expect(inWorker.maxLagMs).toBeLessThan(100);

    // Control: the same busy loop on the main thread starves timers.
    const onMain = await measureLag(
      () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            const t0 = Date.now();
            while (Date.now() - t0 < 500) {
              /* spin */
            }
            resolve(Date.now() - t0);
          }, 20),
        ),
    );
    expect(onMain.maxLagMs).toBeGreaterThan(400);
    console.log(
      `[isolation] worker busy ${inWorker.result.elapsedMs}ms -> main max lag ${inWorker.maxLagMs.toFixed(1)}ms over ${inWorker.ticks} ticks; ` +
        `main-thread busy ${onMain.result}ms -> max lag ${onMain.maxLagMs.toFixed(1)}ms`,
    );
  });
});
