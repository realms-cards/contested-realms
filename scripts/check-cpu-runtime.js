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
console.log("[CPU runtime] BotClient, shared rules, and precon data loaded.");
