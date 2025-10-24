"use strict";

const broadcast = require("./broadcast");
const standings = require("./standings");

async function loadEngine() {
  return import("./engine.js");
}

module.exports = {
  broadcast,
  standings,
  loadEngine,
};
