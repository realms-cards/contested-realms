// Worker-thread pool for server-hosted headless CPU bots (Node/CommonJS only).
// Runs each BotClient inside a worker thread so bot thinking (engine search, spell
// choice generation) never blocks the Socket.IO server's main event loop. Bots still
// talk to the server over localhost socket.io exactly as the in-process client does.
/* eslint-disable */
/* eslint-env node */

const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");

const DEFAULT_MAX_WORKERS = 4;
// Idle workers stay warm briefly (rematches) but are unref'd, so they never keep the
// process alive, and are terminated once the window passes so no zombie threads linger.
const DEFAULT_IDLE_TIMEOUT_MS = 30000;
const MAX_CONSECUTIVE_BOOT_FAILURES = 3;

/** Bot options (they carry botSecret) live here, never on an enumerable/loggable property. */
const botOptions = new WeakMap();

function errorMessage(err) {
  return String((err && err.message) || err || "unknown error");
}

const DISABLE_WORDS = new Set(["false", "off", "no", "none", "disable", "disabled"]);
const DEFAULT_WORDS = new Set(["true", "on", "yes", "auto", "default"]);

function availableCores() {
  return typeof os.availableParallelism === "function" ? os.availableParallelism() : (os.cpus() || []).length || 1;
}

/**
 * CPU_BOT_WORKERS: plain decimal count; 0/false/off/no/none/disable(d) keep bots in-process;
 * unset/true/on/yes/auto/default use the default. Explicit counts are capped at the core count
 * (extra CPU-bound threads only add memory and boot time); anything else warns and uses the default.
 * Default: max(1, min(4, cores - 1)).
 * @param {Record<string, string|undefined>} [env]
 * @param {number} [cores] available cores (injectable for tests)
 * @returns {number}
 */
function resolveWorkerCount(env = process.env, cores = availableCores()) {
  const coreCount = Number.isInteger(cores) && cores > 0 ? cores : 1;
  const fallback = Math.max(1, Math.min(DEFAULT_MAX_WORKERS, coreCount - 1));
  const raw = env ? env.CPU_BOT_WORKERS : undefined;
  const value = raw === undefined || raw === null ? "" : String(raw).trim().toLowerCase();
  if (value === "" || DEFAULT_WORDS.has(value)) return fallback;
  if (DISABLE_WORDS.has(value)) return 0;
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    if (n <= coreCount) return n;
    console.warn(`[BotWorkers] CPU_BOT_WORKERS=${value} exceeds ${coreCount} available core(s); capping at ${coreCount}`);
    return coreCount;
  }
  console.warn(`[BotWorkers] Ignoring invalid CPU_BOT_WORKERS=${JSON.stringify(raw)}; using default (${fallback})`);
  return fallback;
}

/**
 * Stand-in for BotClient with the surface the server uses: new (opts), start(), stop().
 * Subclassed per pool (pool.BotClient) so call sites only choose the constructor.
 */
class WorkerBotClient {
  /**
   * @param {BotWorkerPool} pool
   * @param {{ serverUrl: string, displayName?: string, playerId?: string, lobbyId?: string, botSecret?: string }} opts
   */
  constructor(pool, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    this.serverUrl = o.serverUrl || "http://localhost:3010";
    this.displayName = (o.displayName || "CPU Bot").slice(0, 40);
    this.playerId = o.playerId || `cpu_${Math.random().toString(36).slice(2, 10)}`;
    this.lobbyId = o.lobbyId || null;
    /** @type {'worker'|'in-process'|null} */
    this.hostedIn = null;
    botOptions.set(this, { ...o, playerId: this.playerId });
    Object.defineProperties(this, {
      _pool: { value: pool, writable: false, enumerable: false },
      _state: { value: "idle", writable: true, enumerable: false }, // idle|starting|running|failed|dead|stopped
      _handle: { value: null, writable: true, enumerable: false },
      _record: { value: null, writable: true, enumerable: false },
      _settle: { value: null, writable: true, enumerable: false },
      _startPromise: { value: null, writable: true, enumerable: false },
      _inProcess: { value: null, writable: true, enumerable: false },
      _exitListeners: { value: new Set(), writable: false, enumerable: false },
    });
  }

  /** Resolves when the hosted BotClient.start() resolves; rejects if it fails or its worker dies first. */
  start() {
    if (this._startPromise) return this._startPromise;
    this._startPromise = new Promise((resolve, reject) => { this._settle = { resolve, reject }; });
    if (this._state === "stopped") {
      this._finishStart();
    } else {
      this._state = "starting";
      this._pool._startBot(this);
    }
    return this._startPromise;
  }

  /** Idempotent. Detaches from the worker immediately; the worker stops the hosted client. */
  stop() {
    if (this._state === "stopped") return;
    this._state = "stopped";
    if (this._inProcess) {
      try { this._inProcess.stop(); } catch {}
    }
    this._pool._releaseBot(this, true);
    this._finishStart();
  }

  /**
   * Register a callback fired once if the hosting worker thread dies after start() resolved.
   * (A death during start rejects start() instead, so cleanup runs exactly once.)
   * @param {(reason: string) => void} listener
   * @returns {() => void} unsubscribe
   */
  onUnexpectedExit(listener) {
    if (typeof listener !== "function") return () => {};
    this._exitListeners.add(listener);
    return () => this._exitListeners.delete(listener);
  }

  _finishStart() {
    if (this._state === "starting") this._state = "running";
    const settle = this._settle;
    this._settle = null;
    if (settle) settle.resolve();
  }

  _failStart(err) {
    if (this._state === "starting") this._state = "failed";
    this._pool._releaseBot(this, false);
    const settle = this._settle;
    this._settle = null;
    if (settle) settle.reject(err instanceof Error ? err : new Error(errorMessage(err)));
  }

  _startInProcess(reason) {
    const Ctor = this._pool._fallbackBotClient;
    if (typeof Ctor !== "function") {
      this._failStart(new Error(`CPU bot worker unavailable (${reason}) and no in-process fallback`));
      return;
    }
    try {
      console.warn(`[BotWorkers] Running bot ${this.playerId} in-process (${reason})`);
      const bot = new Ctor(botOptions.get(this));
      this._inProcess = bot;
      this.hostedIn = "in-process";
      Promise.resolve(bot.start()).then(
        () => this._finishStart(),
        (err) => this._failStart(err)
      );
    } catch (err) {
      this._failStart(err);
    }
  }

  /** Called by the pool when the hosting worker exits without being asked to. */
  _onWorkerLost(info) {
    this._record = null;
    this._handle = null;
    if (this._state === "stopped" || this._state === "failed") return;
    if (this._state === "starting") {
      if (info.bootFailure && typeof this._pool._fallbackBotClient === "function") {
        this._startInProcess("worker thread failed to boot");
        return;
      }
      this._state = "dead";
      const settle = this._settle;
      this._settle = null;
      if (settle) settle.reject(new Error(`CPU bot worker exited before bot start completed (code ${info.code})`));
      return;
    }
    this._state = "dead";
    const listeners = Array.from(this._exitListeners);
    this._exitListeners.clear();
    if (listeners.length === 0) {
      console.warn(`[BotWorkers] Bot ${this.playerId} lost its worker thread and has no exit handler`);
    }
    for (const listener of listeners) {
      try { listener(info.reason); } catch (err) { console.error("[BotWorkers] exit handler failed:", errorMessage(err)); }
    }
  }
}

class BotWorkerPool {
  /**
   * @param {{
   *   size?: number,
   *   workerPath?: string,
   *   idleTimeoutMs?: number,
   *   fallbackBotClient?: Function|null,
   *   getCardIdMap?: (() => object|null)|null,
   *   execArgv?: string[],
   *   enableTestHooks?: boolean,
   * }} [options]
   */
  constructor(options = {}) {
    this.size = Number.isInteger(options.size) && options.size >= 0 ? options.size : resolveWorkerCount();
    this.workerPath = options.workerPath || path.join(__dirname, "bot-worker.js");
    this.idleTimeoutMs = Number.isFinite(options.idleTimeoutMs) ? Math.max(0, options.idleTimeoutMs) : DEFAULT_IDLE_TIMEOUT_MS;
    this._fallbackBotClient = typeof options.fallbackBotClient === "function" ? options.fallbackBotClient : null;
    this._getCardIdMap = typeof options.getCardIdMap === "function" ? options.getCardIdMap : null;
    // Plain JS entry: don't inherit loader flags (tsx/vitest) that workers don't need.
    this._execArgv = Array.isArray(options.execArgv) ? options.execArgv : [];
    this._testHooks = options.enableTestHooks === true;
    this._cardIdMap = null;
    /** @type {Set<WorkerRecord>} live (not exiting) workers */
    this._records = new Set();
    this._nextWorkerId = 1;
    this._nextHandle = 1;
    this._nextReqId = 1;
    this._bootFailures = 0;
    this._disabled = this.size <= 0;
    this._closed = false;
    this._spawned = 0;
    this._exited = 0;
    const pool = this;
    /** Constructor with BotClient's call shape, bound to this pool. */
    this.BotClient = class PooledBotClient extends WorkerBotClient {
      constructor(opts) { super(pool, opts); }
    };
  }

  /**
   * Ship the main thread's card ID map to every worker (and future workers) once it exists.
   * @param {object|null} [map] defaults to getCardIdMap()
   * @returns {boolean} whether a new map was shipped
   */
  syncCardIdMap(map) {
    let next = map;
    if (next === undefined && this._getCardIdMap) {
      try { next = this._getCardIdMap(); } catch { next = null; }
    }
    if (!next || typeof next !== "object" || next === this._cardIdMap) return false;
    this._cardIdMap = next;
    for (const rec of this._records) {
      try { rec.worker.postMessage({ type: "cardIdMap", map: next }); } catch (err) {
        console.warn(`[BotWorkers] Failed to send card ID map to worker #${rec.id}:`, errorMessage(err));
      }
    }
    return true;
  }

  _spawn() {
    this.syncCardIdMap();
    const worker = new Worker(this.workerPath, {
      workerData: { realmsBotWorker: true, cardIdMap: this._cardIdMap, enableTestHooks: this._testHooks },
      execArgv: this._execArgv,
    });
    /** @typedef {{ id: number, worker: Worker, threadId: number, bots: Map<string, WorkerBotClient>, ready: boolean, exited: boolean, terminating: boolean, lastError: unknown, idleTimer: NodeJS.Timeout|null, requests: Map<number, { resolve: Function, reject: Function }> }} WorkerRecord */
    /** @type {WorkerRecord} */
    const rec = {
      id: this._nextWorkerId++,
      worker,
      threadId: worker.threadId,
      bots: new Map(),
      ready: false,
      exited: false,
      terminating: false,
      lastError: null,
      idleTimer: null,
      requests: new Map(),
    };
    worker.on("message", (msg) => this._onWorkerMessage(rec, msg));
    worker.on("error", (err) => {
      rec.lastError = err;
      console.error(`[BotWorkers] Worker #${rec.id} error:`, (err && err.stack) || errorMessage(err));
    });
    worker.on("messageerror", (err) => console.error(`[BotWorkers] Worker #${rec.id} message error:`, errorMessage(err)));
    worker.on("exit", (code) => this._onWorkerExit(rec, code));
    this._records.add(rec);
    this._spawned++;
    console.log(`[BotWorkers] Spawned worker #${rec.id} (thread ${rec.threadId}, ${this._records.size}/${this.size})`);
    return rec;
  }

  /** Least-loaded live worker; spawns lazily while below size and no worker is empty. */
  _acquireRecord() {
    let best = null;
    for (const rec of this._records) {
      if (!best || rec.bots.size < best.bots.size) best = rec;
    }
    if (best && best.bots.size === 0) return best;
    if (this._records.size < this.size) return this._spawn();
    return best;
  }

  _markBusy(rec) {
    if (rec.idleTimer) {
      clearTimeout(rec.idleTimer);
      rec.idleTimer = null;
    }
    try { rec.worker.ref(); } catch {}
  }

  _maybeIdle(rec) {
    if (rec.exited || rec.terminating || rec.bots.size > 0 || rec.requests.size > 0 || rec.idleTimer) return;
    try { rec.worker.unref(); } catch {}
    rec.idleTimer = setTimeout(() => {
      rec.idleTimer = null;
      if (rec.bots.size === 0 && rec.requests.size === 0) this._terminate(rec);
    }, this.idleTimeoutMs);
    if (typeof rec.idleTimer.unref === "function") rec.idleTimer.unref();
  }

  _terminate(rec) {
    if (rec.exited) return Promise.resolve();
    rec.terminating = true;
    this._records.delete(rec);
    if (rec.idleTimer) {
      clearTimeout(rec.idleTimer);
      rec.idleTimer = null;
    }
    return rec.worker.terminate().then(() => undefined, () => undefined);
  }

  /** @param {WorkerBotClient} bot */
  _startBot(bot) {
    if (this._closed) {
      bot._failStart(new Error("CPU bot worker pool is shut down"));
      return;
    }
    if (this._disabled) {
      bot._startInProcess("worker threads disabled");
      return;
    }
    let rec = null;
    try {
      rec = this._acquireRecord();
    } catch (err) {
      console.warn("[BotWorkers] Failed to create worker thread; falling back to in-process bot:", errorMessage(err));
      rec = null;
    }
    if (!rec) {
      bot._startInProcess("worker creation failed");
      return;
    }
    this.syncCardIdMap();
    const handle = `bot${this._nextHandle++}`;
    bot._handle = handle;
    bot._record = rec;
    bot.hostedIn = "worker";
    rec.bots.set(handle, bot);
    this._markBusy(rec);
    try {
      rec.worker.postMessage({ type: "start", handle, opts: botOptions.get(bot) });
    } catch (err) {
      bot._failStart(new Error(`Could not hand bot to worker: ${errorMessage(err)}`));
      return;
    }
    console.log(`[BotWorkers] Bot ${bot.playerId} -> worker #${rec.id} (${rec.bots.size} bot(s))`);
  }

  /** Detach a bot from its worker; tell the worker to stop it when asked. */
  _releaseBot(bot, sendStop) {
    const rec = bot._record;
    const handle = bot._handle;
    bot._record = null;
    if (!rec || !handle) return;
    if (rec.bots.get(handle) === bot) rec.bots.delete(handle);
    if (!rec.exited && !rec.terminating) {
      if (sendStop) {
        try { rec.worker.postMessage({ type: "stop", handle }); } catch {}
      }
      this._maybeIdle(rec);
    }
  }

  _onWorkerMessage(rec, msg) {
    if (!msg || typeof msg !== "object") return;
    const bot = typeof msg.handle === "string" ? rec.bots.get(msg.handle) : null;
    switch (msg.type) {
      case "ready":
        rec.ready = true;
        this._bootFailures = 0;
        return;
      case "started":
        if (bot) bot._finishStart();
        return;
      case "startFailed":
        if (bot) bot._failStart(new Error(msg.error || "bot start failed in worker"));
        return;
      case "response": {
        const pending = rec.requests.get(msg.reqId);
        if (!pending) return;
        rec.requests.delete(msg.reqId);
        if (msg.error) pending.reject(new Error(msg.error));
        else pending.resolve(msg.result);
        this._maybeIdle(rec);
        return;
      }
      default:
        return;
    }
  }

  _onWorkerExit(rec, code) {
    const intentional = rec.terminating;
    rec.exited = true;
    this._exited++;
    this._records.delete(rec);
    if (rec.idleTimer) {
      clearTimeout(rec.idleTimer);
      rec.idleTimer = null;
    }
    for (const pending of rec.requests.values()) pending.reject(new Error(`CPU bot worker exited (code ${code})`));
    rec.requests.clear();
    const bots = Array.from(rec.bots.values());
    rec.bots.clear();
    const bootFailure = !rec.ready;
    if (!intentional) {
      console.error(
        `[BotWorkers] Worker #${rec.id} exited unexpectedly (code ${code}, ${bootFailure ? "during boot" : "after boot"}, ${bots.length} bot(s))`
      );
      if (bootFailure && ++this._bootFailures >= MAX_CONSECUTIVE_BOOT_FAILURES && !this._disabled) {
        this._disabled = true;
        console.warn(`[BotWorkers] ${this._bootFailures} consecutive worker boot failures; CPU bots will run in-process`);
      }
    }
    const info = { code, bootFailure, reason: intentional ? "worker_terminated" : "worker_crashed" };
    for (const bot of bots) {
      try { bot._onWorkerLost(info); } catch (err) { console.error("[BotWorkers] cleanup failed:", errorMessage(err)); }
    }
  }

  _request(rec, message) {
    const reqId = this._nextReqId++;
    return new Promise((resolve, reject) => {
      rec.requests.set(reqId, { resolve, reject });
      this._markBusy(rec);
      try {
        rec.worker.postMessage({ ...message, reqId });
      } catch (err) {
        rec.requests.delete(reqId);
        this._maybeIdle(rec);
        reject(err);
      }
    });
  }

  /** Round-trip to a (lazily spawned) worker: proves the entry loads BotClient. No sockets. */
  ping() {
    if (this._closed || this._disabled) return Promise.reject(new Error("CPU bot worker pool unavailable"));
    let rec;
    try { rec = this._acquireRecord(); } catch (err) { return Promise.reject(err); }
    if (!rec) return Promise.reject(new Error("no CPU bot worker available"));
    return this._request(rec, { type: "stats" });
  }

  /** Worker-side stats for every live worker. */
  inspectWorkers() {
    return Promise.all(Array.from(this._records, (rec) => this._request(rec, { type: "stats" })));
  }

  /** Main-thread view of the pool (no secrets). */
  stats() {
    return {
      size: this.size,
      disabled: this._disabled,
      closed: this._closed,
      spawned: this._spawned,
      exited: this._exited,
      workers: Array.from(this._records, (rec) => ({ id: rec.id, threadId: rec.threadId, ready: rec.ready, bots: rec.bots.size })),
    };
  }

  /** Terminate every worker; running bots on them get their exit callbacks ("worker_terminated"). */
  shutdown() {
    this._closed = true;
    return Promise.all(Array.from(this._records, (rec) => this._terminate(rec))).then(() => undefined);
  }

  _requireTestHooks() {
    if (!this._testHooks) throw new Error("BotWorkerPool test hooks are disabled");
  }

  /** TEST ONLY (enableTestHooks): busy-loop inside a worker for ms. */
  __testBusyLoop(ms) {
    this._requireTestHooks();
    const rec = this._acquireRecord();
    if (!rec) return Promise.reject(new Error("no CPU bot worker available"));
    return this._request(rec, { type: "testBusyLoop", ms });
  }

  /** TEST ONLY (enableTestHooks): make the worker hosting bot exit abruptly. */
  __testCrashWorkerOf(bot, code = 70) {
    this._requireTestHooks();
    const rec = bot && bot._record;
    if (!rec) throw new Error("bot is not hosted in a worker");
    rec.worker.postMessage({ type: "testCrash", code });
  }
}

/**
 * Create the pool, or null when CPU_BOT_WORKERS resolves to 0 (in-process bots).
 * @param {ConstructorParameters<typeof BotWorkerPool>[0]} [options]
 */
function createBotWorkerPool(options = {}) {
  const size = Number.isInteger(options.size) && options.size >= 0 ? options.size : resolveWorkerCount();
  if (size <= 0) {
    console.log("[BotWorkers] Worker threads disabled (CPU_BOT_WORKERS resolved to 0): CPU bots run in-process");
    return null;
  }
  console.log(`[BotWorkers] CPU bots run in worker threads (max ${size} worker(s))`);
  return new BotWorkerPool({ ...options, size });
}

module.exports = { BotWorkerPool, WorkerBotClient, createBotWorkerPool, resolveWorkerCount };
