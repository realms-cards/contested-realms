// Generic effects library for rules engine
// Provides a simple registry and a built-in draw effect

function draw(game, playerKey, count) {
  try {
    if (!playerKey || !Number.isFinite(count) || count <= 0) return null;
    const zonesPrev = (game && game.zones && game.zones[playerKey]) || { deck: [], hand: [] };
    const deckPrev = Array.isArray(zonesPrev.deck) ? zonesPrev.deck : [];
    const handPrev = Array.isArray(zonesPrev.hand) ? zonesPrev.hand : [];
    if (deckPrev.length === 0) return null;
    const n = Math.min(count, deckPrev.length);
    const drawn = deckPrev.slice(0, n);
    const deckNext = deckPrev.slice(n);
    const handNext = handPrev.concat(drawn);
    return { zones: { [playerKey]: { deck: deckNext, hand: handNext } } };
  } catch {
    return null;
  }
}

// --- Effect registry ---
const registry = new Map();
registry.set('draw', (game, params) => {
  const { playerKey, count } = params || {};
  return draw(game, playerKey, Number(count) || 0);
});

function registerEffect(name, fn) {
  if (!name || typeof fn !== 'function') return;
  registry.set(String(name), fn);
}

function getEffect(name) {
  return registry.get(String(name)) || null;
}

function applyEffect(game, name, params) {
  try {
    const fn = getEffect(name);
    if (!fn) return null;
    return fn(game, params);
  } catch {
    return null;
  }
}

module.exports = { draw, registerEffect, getEffect, applyEffect };
