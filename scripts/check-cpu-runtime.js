// Run inside the production image: no database, sockets, or match creation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rules = path.join(root, "src/lib/game/cpu");
// Include lazy-loaded Genesis and Blaze modules, not just startup imports.
for (const file of fs.readdirSync(rules).filter(file => file.endsWith(".js"))) {
  require(path.join(rules, file));
}
const { BotClient } = require(path.join(root, "bots/headless-bot-client"));
assert.equal(typeof BotClient, "function", "BotClient constructor unavailable");
const precons = require(path.join(root, "data/precons/beta.json"));
assert.equal(precons.length, 4, "Expected all four Beta precons");
require(path.join(root, "data/cards_raw.json"));
require(path.join(root, "data/mana-providers.json"));

// Bot worker thread: the entry is inert on the main thread; a real worker must boot,
// load BotClient and answer a stats round-trip. No bots are started, so no sockets open.
const workerEntry = path.join(root, "bots/bot-worker.js");
assert.equal(typeof require(workerEntry).WORKER_PROTOCOL, "number", "Bot worker entry unavailable");
const { BotWorkerPool } = require(path.join(root, "bots/bot-worker-pool"));
const pool = new BotWorkerPool({ size: 1, workerPath: workerEntry });
const deadline = setTimeout(() => {
  console.error("[CPU runtime] Bot worker thread did not respond in time.");
  process.exit(1);
}, 20000);
pool
  .ping()
  .then((stats) => {
    assert.equal(stats.bots, 0, "Bot worker should boot with no bots");
    return pool.shutdown();
  })
  .then(() => {
    clearTimeout(deadline);
    console.log("[CPU runtime] BotClient, shared rules, bot worker thread, and precon data loaded.");
  })
  .catch((err) => {
    console.error("[CPU runtime] Bot worker thread failed:", err);
    process.exit(1);
  });
