// Event log lines for the CPU's own actions, in the console's markup ([p2:PLAYER], [p2card:Name]).
// The bot keeps no log: it sends these with botActionToast and the human client records them.
const { tileLabel } = require("../src/lib/game/cpu/tileLabels");

const other = seat => (seat === "p1" ? "p2" : "p1");
const line = (text, size) => tileLabel(text, size || { w: 5, h: 4 });

/** A site, minion or artifact the CPU played from hand, read from its action patch; spells, moves and attacks have their own lines. */
function playLog(patch, seat, size) {
  if (!patch || typeof patch !== "object" || patch._attackMeta || patch._spellCast) return null;
  for (const [at, site] of Object.entries(patch.board?.sites || {})) {
    if (site?.card?.name) return line(`[${seat}:PLAYER] plays [${seat}card:${site.card.name}] at ${at}`, size);
  }
  if (!patch.zones) return null;
  for (const [at, items] of Object.entries(patch.permanents || {})) {
    const newest = Array.isArray(items) ? items[items.length - 1] : null;
    if (newest?.card?.name) return line(`[${seat}:PLAYER] plays [${seat}card:${newest.card.name}] at ${at}`, size);
  }
  return null;
}

/** The CPU unit's move, or its attack when it has a target ({kind: "avatar" | "permanent" | "site", at, index}). */
function combatLog(game, attacker, target, seat, size) {
  const unit = `[${seat}card:${attacker.card.name}]`;
  if (!target) return line(`${unit} moves to ${attacker.at}`, size);
  const opponent = other(seat);
  const name = target.kind === "avatar" ? game.avatars?.[opponent]?.card?.name
    : target.kind === "site" ? game.board?.sites?.[target.at]?.card?.name
    : game.permanents?.[target.at]?.[target.index]?.card?.name;
  return line(`${unit} attacks ${name ? `[${opponent}card:${name}]` : "a target"} at ${target.at}`, size);
}

const castLog = (seat, name) => `[${seat}:PLAYER] casts [${seat}card:${name}]`;
const abilityLog = (seat, name) => `[${seat}:PLAYER] activates [${seat}card:${name}]`;
const endTurnLog = seat => `[${seat}:PLAYER] ends the turn`;

module.exports = { abilityLog, castLog, combatLog, endTurnLog, playLog };
