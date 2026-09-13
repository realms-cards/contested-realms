// Worker-thread entry hosting headless CPU bots for the Socket.IO server.
// Spawned by bots/bot-worker-pool.js; inert when required from the main thread.
/* eslint-disable */
/* eslint-env node */

const { isMainThread, parentPort, threadId, workerData } = require("worker_threads");

const WORKER_PROTOCOL = 1;

function errorMessage(err) {
  return String((err && err.message) || err || "unknown error");
}

/**
 * Host BotClient instances inside this thread, driven by pool messages.
 * Bot options (including botSecret) only ever arrive via messages; they are never logged.
 * @param {import('worker_threads').MessagePort} port
 * @param {{ cardIdMap?: object|null, enableTestHooks?: boolean }} data
 */
function runWorker(port, data) {
  const client = require("./headless-bot-client");
  const testHooks = !!(data && data.enableTestHooks === true);
  if (data && data.cardIdMap && typeof data.cardIdMap === "object") client.setCardIdMap(data.cardIdMap);
  /** @type {Map<string, InstanceType<typeof client.BotClient>>} */
  const bots = new Map();
  const post = (msg) => {
    try { port.postMessage(msg); } catch (err) { console.error("[BotWorker] postMessage failed:", errorMessage(err)); }
  };
  const respond = (reqId, result, error) => post({ type: "response", reqId, result, error: error ? errorMessage(error) : null });

  port.on("message", (msg) => {
    if (!msg || typeof msg !== "object") return;
    const handle = typeof msg.handle === "string" ? msg.handle : null;
    switch (msg.type) {
      case "cardIdMap":
        client.setCardIdMap(msg.map);
        return;
      case "start": {
        if (!handle || bots.has(handle)) return;
        let bot = null;
        let started;
        try {
          bot = new client.BotClient(msg.opts || {});
          bots.set(handle, bot);
          started = Promise.resolve(bot.start());
        } catch (err) {
          started = Promise.reject(err);
        }
        started.then(
          () => post({ type: "started", handle }),
          (err) => {
            if (bot && bots.get(handle) === bot) {
              bots.delete(handle);
              try { bot.stop(); } catch {}
            }
            post({ type: "startFailed", handle, error: errorMessage(err) });
          }
        );
        return;
      }
      case "stop": {
        const bot = handle ? bots.get(handle) : null;
        if (bot) {
          bots.delete(handle);
          try { bot.stop(); } catch (err) { console.warn("[BotWorker] bot.stop() failed:", errorMessage(err)); }
        }
        post({ type: "stopped", handle });
        return;
      }
      case "stats": {
        const map = client.getCardIdMap();
        respond(msg.reqId, { threadId, bots: bots.size, cardIdMapEntries: map ? Object.keys(map).length : 0 });
        return;
      }
      case "shutdown":
        for (const bot of bots.values()) { try { bot.stop(); } catch {} }
        bots.clear();
        process.exit(0);
        return;
      // Test-only hooks: ignored unless the pool was created with enableTestHooks (never in the server).
      case "testBusyLoop": {
        if (!testHooks) return respond(msg.reqId, null, new Error("test hooks disabled"));
        const ms = Math.max(0, Math.min(10000, Number(msg.ms) || 0));
        const t0 = Date.now();
        let spins = 0;
        while (Date.now() - t0 < ms) spins++;
        respond(msg.reqId, { elapsedMs: Date.now() - t0, spins });
        return;
      }
      case "testCrash":
        if (!testHooks) return respond(msg.reqId, null, new Error("test hooks disabled"));
        process.exit(Number.isInteger(msg.code) ? msg.code : 70);
        return;
      default:
        return;
    }
  });

  post({ type: "ready", protocol: WORKER_PROTOCOL, threadId });
}

if (!isMainThread && parentPort && workerData && workerData.realmsBotWorker === true) {
  runWorker(parentPort, workerData);
}

module.exports = { runWorker, WORKER_PROTOCOL };
