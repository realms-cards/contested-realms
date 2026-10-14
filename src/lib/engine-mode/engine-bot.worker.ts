/// <reference lib="webworker" />
// Upstream's search-bot worker: installs self.onmessage on import. The bot builds its own engine
// copy in this worker, so our script patches must load here too or the CPU plays by other rules.
import "@untested-realm/bot/bot.worker";
import "./scriptPatches";
