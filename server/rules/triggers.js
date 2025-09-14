// Trigger scaffolding: currently implements a minimal Genesis trigger skeleton
// The trigger attaches a simple event into the patch when a permanent with 'Genesis' is placed.

const { getKeywordsForCard } = require('./keywords');

function collectNewPermanents(action) {
  const out = [];
  if (!action || typeof action !== 'object') return out;
  const per = action.permanents;
  if (!per || typeof per !== 'object') return out;
  for (const key of Object.keys(per)) {
    const arr = Array.isArray(per[key]) ? per[key] : [];
    for (const p of arr) {
      if (p && p.card) out.push({ cell: key, entry: p });
    }
  }
  return out;
}

function applyGenesis(game, action, playerId, context) {
  try {
    const placements = collectNewPermanents(action);
    if (!placements.length) return null;
    const events = [];
    for (const { cell, entry } of placements) {
      const kws = getKeywordsForCard(entry.card);
      if (kws.includes('Genesis')) {
        // For now, emit a basic event describing the trigger; effect resolution can be added later.
        events.push({
          id: 0, // Server will resequence via mergeEvents
          type: 'trigger',
          name: 'Genesis',
          cell,
          playerId,
          cardName: entry.card && entry.card.name,
          message: `Genesis triggers for ${entry.card && entry.card.name} at ${cell}`,
        });
      }
    }
    if (!events.length) return null;
    return { events };
  } catch {
    return null;
  }
}

module.exports = { applyGenesis };
