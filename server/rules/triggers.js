// Trigger scaffolding: currently implements a minimal Genesis trigger skeleton
// The trigger attaches a simple event into the patch when a permanent with 'Genesis' is placed.

const { draw } = require('./effects');
const { getKeywordsForCard, getKeywordDefinition } = require('./keywords');

function getPlayerKey(match, playerId) {
  if (!match || !Array.isArray(match.playerIds)) return null;
  const idx = match.playerIds.indexOf(playerId);
  if (idx === 0) return 'p1';
  if (idx === 1) return 'p2';
  return null;
}


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
    const match = context && context.match ? context.match : null;
    const meKey = getPlayerKey(match, playerId);
    let zonesPatch = null;
    for (const { cell, entry } of placements) {
      const kws = getKeywordsForCard(entry.card);
      if (kws.includes('Genesis')) {
        // Draw 1 card for the acting player (minimal effect)
        if (meKey) {
          const drawPatch = draw(game, meKey, 1);
          if (drawPatch) {
            // merge zones patches together for multiple triggers
            const prevZones = (zonesPatch && zonesPatch.zones) || {};
            zonesPatch = { zones: { ...prevZones, ...drawPatch.zones } };
          }
        }
        // Emit a basic event describing the trigger
        events.push({
          id: 0, // Server will resequence via mergeEvents
          type: 'trigger',
          name: 'Genesis',
          cell,
          playerId,
          cardName: entry.card && entry.card.name,
          message: `Genesis: draw 1 card for ${meKey || 'player'}.`,
        });
      }
    }
    if (!events.length) return null;
    return zonesPatch ? { ...zonesPatch, events } : { events };
  } catch {
    return null;
  }
}

module.exports = { applyGenesis };
 
// Attach keyword metadata events for UI (no-op validations like Airborne, etc.)
function applyKeywordAnnotations(game, action, playerId, _context) {
  try {
    const placements = collectNewPermanents(action);
    if (!placements.length) return null;
    const events = [];
    for (const { cell, entry } of placements) {
      const kws = getKeywordsForCard(entry.card) || [];
      for (const kw of kws) {
        // Only annotate safe, informational keywords for now
        if (['Airborne'].includes(kw) || kw) {
          const desc = getKeywordDefinition(kw) || '';
          events.push({ id: 0, type: 'keyword', name: kw, cell, playerId, cardName: entry.card && entry.card.name, info: desc });
        }
      }
    }
    if (!events.length) return null;
    return { events };
  } catch {
    return null;
  }
}

module.exports.applyKeywordAnnotations = applyKeywordAnnotations;
