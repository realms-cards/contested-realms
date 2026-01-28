"use strict";

const broadcast = require("./broadcast");
const standings = require("./standings");
const tiebreaker = require("./tiebreaker");

async function loadEngine() {
  return import("./engine.js");
}

module.exports = {
  broadcast,
  standings,
  tiebreaker,
  loadEngine,
};
