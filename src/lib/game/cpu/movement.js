/* eslint-disable @typescript-eslint/no-require-imports -- Shared directly with the CommonJS CPU engine. */
const { affectedByAura } = require('./auras');
const { enterScope, leaveScope, occupiedCells, realmUnits } = require('./evalScope');
const { cardText, isDisabled, isWater } = require('./spells');

/** @param {import('./spellTypes').SpellState} state @param {import('../store/types').PermanentItem} unit */
function movementAllowance(state,unit) {
  const effect = unit.cpuTurnEffect?.turn === `${state.turn}:${state.currentPlayer}` ? unit.cpuTurnEffect : null;
  return 1 + Number(cardText(unit.card).match(/Movement\s*\+\s*(\d+)/i)?.[1] || 0) + (effect?.movement || 0);
}

/** @param {import('./spellTypes').SpellState} state @param {string} from @param {import('../store/types').PermanentItem} unit @param {string} [origin] */
function movementSteps(state,from,unit,origin = from) {
  enterScope();
  try { return stepsFrom(state,from,unit,origin); } finally { leaveScope(); }
}

/** @param {import('./spellTypes').SpellState} state @param {string} from @param {import('../store/types').PermanentItem} unit @param {string} origin */
function stepsFrom(state,from,unit,origin) {
  const text = cardText(unit.card), layer = state.permanentPositions?.[unit.instanceId || unit.card.instanceId]?.state || 'surface';
  // Server snapshots carry board.sites without board.size (the bot's live state); the realm is 5x4.
  const size = state.board.size || { w: 5, h: 4 };
  if (/\bImmobile\b/.test(text)) return [];
  if (unit.card.type !== 'Avatar' && state.board.sites[from]?.card && affectedByAura(state.permanents,from,'Entangle Terrain')) return [];
  if ((state.board.sites[from]?.cpuImmobileUntil || 0)>state.turn) return [];
  if (/\bWaterbound\b/.test(text) && !isWater(state,from) || /\bLandbound\b/.test(text) && isWater(state,from)) return [];
  const airborne = layer === 'surface' && /\bAirborne\b/.test(text);
  const site = state.board.sites[from]?.card;
  const here = state.permanents[from] || [];
  // Granted Voidwalk: a "Bearer has ... Voidwalk" artifact carried by this minion (All-terrain
  // Vestments), or Lucid Dreamers sharing its void — the same shape as Planar Gate granting it.
  const printed = /\bVoidwalk\b/.test(text);
  const bearer = printed ? -1 : here.findIndex(item => (item.instanceId || item.card?.instanceId) === (unit.instanceId || unit.card.instanceId));
  const vested = !printed && unit.card.type === 'Minion' && bearer >= 0 && here.some(item =>
    item.attachedTo?.at === from && item.attachedTo.index === bearer && /Bearer has [^.]*\bVoidwalk\b/.test(cardText(item.card)));
  const voidwalk = printed || vested || site?.name === 'Planar Gate' ||
    (!site && (unit.cpuPlanarVoidwalk || here.some(item => item.card?.name === 'Lucid Dreamers') ||
      state.board.sites[origin]?.card?.name === 'Planar Gate'));
  const [x,y] = from.split(',').map(Number), result = [];
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],...(airborne ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [])]) {
    if (/only move themselves forward/.test(text) && (dx !== 0 || dy !== (unit.owner === 1 ? -1 : 1))) continue;
    if (/only move themselves sideways/.test(text) && dy !== 0) continue;
    const nx=x+dx;
    let ny=y+dy;
    if (unit.card.name === 'Polar Bears') ny = (ny+size.h)%size.h;
    const at = `${nx},${ny}`, destination = state.board.sites[at]?.card;
    if (nx<0 || ny<0 || nx>=size.w || ny>=size.h) continue;
    if (!destination && (!voidwalk || unit.card.type === 'Avatar')) continue;
    // An oversized unit steps with all four of its locations: each must be on the board and able to hold it.
    const cells = occupiedCells(unit.card.name,at);
    if (cells.length > 1 && cells.some(cell => { const [cx,cy] = cell.split(',').map(Number); return cx>=size.w || cy>=size.h || (!state.board.sites[cell]?.card && !voidwalk); })) continue;
    if (layer === 'burrowed' && (!destination || isWater(state,at))) continue;
    if (layer === 'submerged' && (!destination || !isWater(state,at))) continue;
    if (dx && dy && (!destination || !site)) continue;
    if (layer === 'surface' && !airborne && unit.card.type !== 'Avatar' && destination?.name === 'Mountain Pass' &&
        state.permanents[at]?.some(p => p.instanceId !== unit.instanceId && (p.card.type === 'Minion' || p.card.name === 'Foot Soldier') &&
          (state.permanentPositions[p.instanceId || p.card.instanceId]?.state || 'surface') === 'surface')) continue;
    result.push({at,cost:airborne && site?.name === 'Updraft Ridge' ? 0 : 1});
  }
  return result;
}

/** @param {import('./spellTypes').SpellState} state @param {string} from @param {import('../store/types').PermanentItem} unit @param {number} [budget] */
function movementRoutes(state,from,unit,budget = movementAllowance(state,unit)) {
  enterScope();
  try { return routesFrom(state,from,unit,budget); } finally { leaveScope(); }
}

/** @param {import('./spellTypes').SpellState} state @param {string} from @param {import('../store/types').PermanentItem} unit @param {number} budget */
function routesFrom(state,from,unit,budget) {
  const routes = new Map([[from,{path:[from],cost:0}]]), frontier = [from];
  while (frontier.length) {
    const cell = frontier.shift(), previous = routes.get(cell);
    for (const next of stepsFrom(state,cell,unit,from)) {
      const cost = previous.cost+next.cost;
      if (cost>budget || (routes.get(next.at)?.cost ?? Infinity)<=cost) continue;
      routes.set(next.at,{path:[...previous.path,next.at],cost}); frontier.push(next.at);
    }
  }
  return routes;
}

/** @param {import('./spellTypes').SpellState} state @param {string} from @param {import('../store/types').PermanentItem} unit @returns {string[]} */
function reachableCells(state,from,unit) {
  enterScope();
  try {
    const located = realmUnits(state).find(u => u.target.kind === 'permanent' && u.target.instanceId === unit.instanceId);
    if (located && isDisabled(state,located)) return [];
    const text = cardText(unit.card);
    if (/\bWaterbound\b/.test(text) && !isWater(state,from) || /\bLandbound\b/.test(text) && isWater(state,from)) return [];
    return [...movementRoutes(state,from,unit).keys()];
  } finally { leaveScope(); }
}

module.exports = { reachableCells,movementAllowance,movementSteps,movementRoutes };
