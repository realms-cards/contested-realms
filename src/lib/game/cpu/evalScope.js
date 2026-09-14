/* eslint-disable @typescript-eslint/no-require-imports -- Shared directly with the Node CommonJS CPU engine. */
// Per-snapshot evaluation cache for the shared CPU rules (human client store and Node bot).
//
// Lifetime: the outermost exported rules call opens a scope and closes it in `finally`;
// nested exported calls reuse the active scope. Nothing survives a top-level call, because
// callers mutate game state in place between calls (the headless bot assigns
// `_game.avatars[seat]` / `_game.zones[seat]`, patch merges share or replace nested objects).
//
// Keys: inside one scope callers derive states ({...state, pendingMagic} for Raise Dead,
// abilityChoices' normalized collections). A snapshot is reused only when every slice a
// cached fact reads is identical: permanents, permanentPositions, avatars, board.sites,
// pendingCombat, players, turn and currentPlayer.
//
// Invariants: rules code never mutates game state during a scope, and cached units, targets
// and fact arrays are shared read-only. Exported helpers that hand units or arrays to
// callers (unitsInRealm, bodyOfWater, unitStats) return fresh copies.
//
// Cost: a single top-level helper call (isDisabled, hasStealth, isWater, scoreOperations, as
// made one unit at a time by the bot, controller and combat code) must stay no dearer than
// its plain realm scan. Everything beyond the unit list is therefore built on demand: the
// scope object is reused, fact and label maps are created on first write, and the unit
// position map and target index are only built once a snapshot has served a few lookups
// through the equivalent linear scans.
const cards = require('./cards.json');
const { tileLabel } = require('./tileLabels');

/** @typedef {import('./spellTypes').SpellState} SpellState */
/** @typedef {import('./spellTypes').LocatedUnit} LocatedUnit */
/** @typedef {import('./spellTypes').UnitTarget} UnitTarget */
/** @typedef {{avatars: Map<unknown, number>, ids: Map<unknown, number>, bare: Map<unknown, Map<unknown, number>>, cells: Map<unknown, Map<unknown, number>>}} UnitLookup */
/**
 * @typedef {{permanents: unknown, permanentPositions: unknown, avatars: unknown, sites: unknown, pendingCombat: unknown,
 *   players: unknown, turn: unknown, currentPlayer: unknown, units: LocatedUnit[] | null, positions: Map<LocatedUnit, number> | null,
 *   probes: number, lookup: UnitLookup | null, finds: number, basilisks: LocatedUnit[] | null, facts: Map<string, Map<unknown, unknown>> | null}} Snapshot
 */

/** Lookups a snapshot answers by linear scan before it builds the position map / target index. */
const LINEAR_LOOKUPS = 8;

let depth = 0;
/** @type {{snapshots: Snapshot[], labels: Map<unknown, Map<string, string>> | null}} */
const ACTIVE = { snapshots: [], labels: null };
/** @type {typeof ACTIVE | null} */
let scope = null;

function enterScope() {
  if (depth++ === 0) scope = ACTIVE;
}

function leaveScope() {
  if (--depth === 0) {
    ACTIVE.snapshots.length = 0;
    ACTIVE.labels = null;
    scope = null;
  }
}

/** @param {SpellState} state @returns {Snapshot} */
function snapshotOf(state) {
  const permanents = state.permanents, permanentPositions = state.permanentPositions, avatars = state.avatars, sites = state.board?.sites;
  const pendingCombat = state.pendingCombat, players = state.players, turn = state.turn, currentPlayer = state.currentPlayer;
  if (scope) for (const snap of scope.snapshots) {
    if (snap.permanents === permanents && snap.permanentPositions === permanentPositions && snap.avatars === avatars && snap.sites === sites &&
      snap.pendingCombat === pendingCombat && snap.players === players && snap.turn === turn && snap.currentPlayer === currentPlayer) return snap;
  }
  /** @type {Snapshot} */
  const snap = { permanents, permanentPositions, avatars, sites, pendingCombat, players, turn, currentPlayer, units: null, positions: null, probes: 0, lookup: null, finds: 0, basilisks: null, facts: null };
  if (scope) {
    if (scope.snapshots.length >= 16) scope.snapshots.shift();
    scope.snapshots.push(snap);
  }
  return snap;
}

/** @param {Snapshot} snap @param {string} name @returns {Map<unknown, unknown>} */
function facts(snap, name) {
  const all = snap.facts || (snap.facts = new Map());
  let known = all.get(name);
  if (!known) all.set(name, known = new Map());
  return known;
}

/** @param {SpellState} state @returns {LocatedUnit[]} */
function buildUnits(state) {
  const result = [];
  for (const [at, items] of Object.entries(state.permanents || {})) {
    items.forEach((item, index) => {
      const type = item.card?.type || cards[item.card?.name]?.type;
      if (type !== 'Minion' && !(type === 'Token' && ['Foot Soldier','Skeleton','Frog','Bruin','Tawny'].includes(item.card.name)) && !/Automaton/i.test(cards[item.card?.name]?.subTypes || '')) return;
      const position = state.permanentPositions?.[item.instanceId || item.card?.instanceId];
      const region = position?.state === 'burrowed' ? 'underground'
        : position?.state === 'submerged' ? 'underwater'
        : state.board.sites[at]?.card ? 'surface' : 'void';
      result.push({
        target: { kind: 'permanent', at, index, instanceId: item.instanceId || item.card?.instanceId },
        at, region, owner: item.owner === 1 ? 'p1' : 'p2', card: item.card, damage: item.damage || 0,
      });
    });
  }
  for (const seat of ['p1', 'p2']) {
    const avatar = state.avatars?.[seat];
    if (!avatar?.pos || !avatar.card) continue;
    result.push({ target: { kind: 'avatar', seat }, at: avatar.pos.join(','),
      region: 'surface', owner: seat, card: avatar.card, damage: 0 });
  }
  return /** @type {LocatedUnit[]} */ (result);
}

/**
 * Units of the snapshot, shared read-only inside a scope (fresh when no scope is open).
 * @param {SpellState} state @param {Snapshot} [snap] @returns {LocatedUnit[]}
 */
function realmUnits(state, snap = snapshotOf(state)) {
  if (!snap.units) snap.units = buildUnits(state);
  return snap.units;
}

/** Units the caller may keep or mutate. @param {SpellState} state @returns {LocatedUnit[]} */
function freshUnits(state) {
  if (!scope) return buildUnits(state);
  return realmUnits(state).map(unit => /** @type {LocatedUnit} */ ({ target: { ...unit.target }, at: unit.at, region: unit.region, owner: unit.owner, card: unit.card, damage: unit.damage }));
}

/**
 * Position of a unit object owned by this snapshot, for per-unit memoization; undefined for foreign units.
 * @param {Snapshot} snap @param {LocatedUnit} unit
 */
function unitPosition(snap, unit) {
  const units = snap.units;
  // No unit list built yet, so the unit cannot be one of its objects.
  if (!units) return undefined;
  if (!snap.positions) {
    if (snap.probes++ < LINEAR_LOOKUPS) {
      const index = units.indexOf(unit);
      return index < 0 ? undefined : index;
    }
    snap.positions = new Map(units.map((known, index) => [known, index]));
  }
  return snap.positions.get(unit);
}

/** Same predicate as spells.js sameTarget (spells.js requires this module, so it cannot be imported).
 * @param {UnitTarget} a @param {UnitTarget} b */
function sameTarget(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'avatar' && b.kind === 'avatar') return a.seat === b.seat;
  return a.kind === 'permanent' && b.kind === 'permanent' &&
    (a.instanceId && b.instanceId ? a.instanceId === b.instanceId : a.at === b.at && a.index === b.index);
}

/** @param {Map<unknown, Map<unknown, number>>} map @param {unknown} at @param {unknown} index @param {number} position */
function firstAt(map, at, index, position) {
  let row = map.get(at);
  if (!row) map.set(at, row = new Map());
  if (!row.has(index)) row.set(index, position);
}

/**
 * Same result as `unitsInRealm(state).find(unit => sameTarget(unit.target, target))`.
 * @param {SpellState} state @param {UnitTarget} target @param {Snapshot} [snap] @returns {LocatedUnit | undefined}
 */
function findUnit(state, target, snap = snapshotOf(state)) {
  const units = realmUnits(state, snap);
  if (!snap.lookup && snap.finds++ < LINEAR_LOOKUPS) return units.find(unit => sameTarget(unit.target, target));
  if (!units.length) return undefined;
  const kind = target.kind;
  if (kind !== 'avatar' && kind !== 'permanent') return undefined;
  let lookup = snap.lookup;
  if (!lookup) {
    /** @type {UnitLookup} */
    const built = { avatars: new Map(), ids: new Map(), bare: new Map(), cells: new Map() };
    units.forEach((unit, position) => {
      const t = unit.target;
      if (t.kind === 'avatar') {
        if (!built.avatars.has(t.seat)) built.avatars.set(t.seat, position);
        return;
      }
      if (t.instanceId) {
        if (!built.ids.has(t.instanceId)) built.ids.set(t.instanceId, position);
      } else firstAt(built.bare, t.at, t.index, position);
      firstAt(built.cells, t.at, t.index, position);
    });
    lookup = snap.lookup = built;
  }
  /** @type {number | undefined} */
  let position;
  if (target.kind === 'avatar') position = lookup.avatars.get(target.seat);
  else if (target.instanceId) {
    // sameTarget compares ids only when both sides have one; units without an id still match by location.
    const byId = lookup.ids.get(target.instanceId), bare = lookup.bare.get(target.at)?.get(target.index);
    position = byId === undefined ? bare : bare === undefined ? byId : Math.min(byId, bare);
  } else position = lookup.cells.get(target.at)?.get(target.index);
  return position === undefined ? undefined : units[position];
}

/**
 * Same element as `[...items].sort((a,b) => scoreOf(b)-scoreOf(a))[0]` for a pure scoreOf.
 * Array#sort is stable, so with finite scores that is the first maximal item. Any other
 * score (NaN comparisons, Infinity-Infinity) replays the identical sort over the computed scores.
 * @template T @param {T[]} items @param {(item: T) => number} scoreOf @returns {T | undefined}
 */
function bestByScore(items, scoreOf) {
  if (items.length < 2) return items[0];
  const scores = items.map(item => scoreOf(item));
  let best = 0;
  for (let index = 0; index < scores.length; index++) {
    if (!Number.isFinite(scores[index])) {
      const byItem = new Map(items.map((item, position) => [item, scores[position]]));
      return [...items].sort((a, b) => Number(byItem.get(b)) - Number(byItem.get(a)))[0];
    }
    if (scores[index] > scores[best]) best = index;
  }
  return items[best];
}

/** @type {Map<string, readonly number[]>} */
const CELLS = new Map();
/** Same values as `at.split(',').map(Number)`; shared, never mutate. @param {string} at @returns {readonly number[]} */
function cellOf(at) {
  if (typeof at !== 'string') return at.split(',').map(Number);
  let cell = CELLS.get(at);
  if (!cell) {
    if (CELLS.size >= 4096) CELLS.clear();
    CELLS.set(at, cell = Object.freeze(at.split(',').map(Number)));
  }
  return cell;
}

/** tileLabel memoized for the active scope. @param {string} label @param {{w:number,h:number}} size @returns {string} */
function scopedTileLabel(label, size) {
  if (!scope || typeof label !== 'string') return tileLabel(label, size);
  const labels = scope.labels || (scope.labels = new Map());
  let bySize = labels.get(size);
  if (!bySize) labels.set(size, bySize = new Map());
  let result = bySize.get(label);
  if (result === undefined) bySize.set(label, result = tileLabel(label, size));
  return result;
}

module.exports = { enterScope, leaveScope, snapshotOf, facts, realmUnits, freshUnits, unitPosition, findUnit, bestByScore, cellOf, scopedTileLabel };
