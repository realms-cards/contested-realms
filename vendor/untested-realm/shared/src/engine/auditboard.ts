// Shared board scaffolding for the playability audits. Extracted verbatim from
// scripts/audit_playable.ts so BOTH the engine-side interaction-parity sweep and
// the DOM-level playability audit run on the SAME boards — the engine audit's
// results are then a trustworthy oracle for the DOM audit.
//
//   • board()  — the proven scaffold: starterDecks, both hands kept, 7 Rustic
//     Villages, 2 Foot Soldiers, +50 mana for player 0, and player 0's threshold
//     waiver so any spell is castable regardless of affinity.
//   • place() / summon() / inject() — add a site / a minion / a hand card using
//     the SAME fake `fz`-prefixed ids the script has always used (so audit_playable
//     stays byte-identical).
//
// IMPORTANT id caveat (why usummon exists): the engine's target parser
// (parseTargetRefs in casting.ts) only recognises a target ref that begins with
// `u`/`s`/`a`. The fake `fzu…` ids above therefore DO NOT parse as unit targets —
// audit_playable relies on that (it targets units only via engine-enumerated
// prompt candidates or `sq:` refs). The DOM driver, by contrast, clicks a unit
// chip whose `data-unit` is the real object id, so a unit it must TARGET has to
// carry an engine-valid id. `usummon` mints one via newId(state,'u').

import { createGame } from './setup'
import { applyAction } from './game'
import { newId } from './effects'
import { starterDecks } from '../cards/starterDecks'
import { allCards, getCard } from '../cards/db'
import { getScript } from '../cards/scripts/registry'
import type { GameState, PlayerId } from './types'
import type { DeckList } from './decks'

/** the proven audit scaffold (identical to scripts/audit_playable.ts). */
export function board(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 7, 0)
  // this artificial scaffold places its own sites — skip the forced first-turn site
  g.players[0].firstSiteDone = true; g.players[1].firstSiteDone = true
  applyAction(g, 0, { t: 'keepHand' }); applyAction(g, 1, { t: 'keepHand' })
  for (const [x, y] of [[2, 0], [2, 1], [3, 1], [1, 1]]) place(g, 0, 'Rustic Village', x, y)
  for (const [x, y] of [[2, 3], [2, 2], [3, 2]]) place(g, 1, 'Rustic Village', x, y)
  summon(g, 0, 'Foot Soldier', 2, 1); summon(g, 1, 'Foot Soldier', 2, 2)
  g.players[0].mana += 50
  g.flow = g.flow ?? {}
  g.flow.noThreshold = { ...(g.flow.noThreshold ?? {}), 0: g.turn } as any
  return g
}

/** board() but with player 0's Avatar overridden to `avatarName`. The avatar comes
 *  from the DECK (createGame reads deck.avatar → getCard → the avatar UnitState), so
 *  we clone starterDecks[0] with a new `avatar` field and rebuild the same proven
 *  scaffold (Rustic Villages, Foot Soldiers, +50 mana, player-0 threshold waiver).
 *  Used by the Phase-F avatar-ability DOM audit; audit_playable can reuse it too. */
export function boardWithAvatar(avatarName: string): GameState {
  const deck0: DeckList = { ...starterDecks[0], avatar: avatarName }
  const g = createGame([deck0, starterDecks[1]], ['A', 'B'], 7, 0)
  // resolve any avatar onSetup prompt (e.g. the Dragonlord's pre-game "set aside a Unique
  // Dragon") first — it is pushed during createGame and would otherwise block the mulligan
  // and every later action on this scaffold. A real game answers it before setup too.
  let guard = 0
  while (g.prompts.length && guard++ < 8) {
    const p: any = g.prompts[0]
    const choice = p.data?.names?.[0] ?? p.data?.cards?.[0] ?? p.data?.candidates?.[0] ?? false
    applyAction(g, p.player, { t: 'prompt', promptId: p.id, choice })
  }
  g.players[0].firstSiteDone = true; g.players[1].firstSiteDone = true // scaffold: skip forced first site
  applyAction(g, 0, { t: 'keepHand' }); applyAction(g, 1, { t: 'keepHand' })
  for (const [x, y] of [[2, 0], [2, 1], [3, 1], [1, 1]]) place(g, 0, 'Rustic Village', x, y)
  for (const [x, y] of [[2, 3], [2, 2], [3, 2]]) place(g, 1, 'Rustic Village', x, y)
  summon(g, 0, 'Foot Soldier', 2, 1); summon(g, 1, 'Foot Soldier', 2, 2)
  g.players[0].mana += 50
  g.flow = g.flow ?? {}
  g.flow.noThreshold = { ...(g.flow.noThreshold ?? {}), 0: g.turn } as any
  return g
}

/** Re-mint the audit scaffolds' fake `fz…` ids (units `fzu`, sites `fzs`,
 *  artifacts `fza`, card records `fz`) to ENGINE-VALID `u`/`s`/`a`/`c` ids, fixing
 *  every cross-reference (cardId links, carry lists, avatarUnitId, hand/deck/graveyard
 *  card lists). A scaffold turned into a saved scenario must be fully targetable — a
 *  spell click sends the object's real id, and the target parser only accepts u/s/a
 *  prefixes. Mutates and returns the state. */
export function normalizeIds(g: GameState): GameState {
  const cardMap = new Map<string, string>()
  const unitMap = new Map<string, string>()
  const siteMap = new Map<string, string>()
  const artMap = new Map<string, string>()
  const isFake = (id: string) => id.startsWith('fz')
  // 1) assign fresh ids for every fake-id object
  for (const id of Object.keys(g.cards)) if (isFake(id)) cardMap.set(id, newId(g, 'c'))
  for (const id of Object.keys(g.units)) if (isFake(id)) unitMap.set(id, newId(g, 'u'))
  for (const id of Object.keys(g.sites)) if (isFake(id)) siteMap.set(id, newId(g, 's'))
  for (const id of Object.keys(g.artifacts)) if (isFake(id)) artMap.set(id, newId(g, 'a'))
  const remap = (m: Map<string, string>, id: string | null | undefined) =>
    id != null && m.has(id) ? m.get(id)! : id
  const remapList = (m: Map<string, string>, list: string[] | undefined) =>
    (list ?? []).map((id) => remap(m, id) as string)
  // 2) rewrite each collection's keys + `.id` + internal references
  const rekey = <T extends { id: string }>(coll: Record<string, T>, m: Map<string, string>, fix: (o: T) => void) => {
    for (const [oldId, newIdv] of m) {
      const o = coll[oldId]
      delete coll[oldId]
      o.id = newIdv
      coll[newIdv] = o
    }
    for (const o of Object.values(coll)) fix(o)
  }
  rekey(g.cards as any, cardMap, () => {})
  rekey(g.units as any, unitMap, (u: any) => {
    u.cardId = remap(cardMap, u.cardId)
    u.carrying = remapList(artMap, u.carrying)
    u.carryingUnits = remapList(unitMap, u.carryingUnits)
    u.carriedBy = remap(unitMap, u.carriedBy)
  })
  rekey(g.sites as any, siteMap, (s: any) => { s.cardId = remap(cardMap, s.cardId) })
  rekey(g.artifacts as any, artMap, (a: any) => {
    a.cardId = remap(cardMap, a.cardId)
    a.carriedBy = remap(unitMap, a.carriedBy)
  })
  // 3) player-held references
  for (const p of g.players as any[]) {
    p.avatarUnitId = remap(unitMap, p.avatarUnitId)
    for (const zone of ['hand', 'spellbook', 'atlas', 'cemetery', 'banished'] as const) {
      if (Array.isArray(p[zone])) p[zone] = remapList(cardMap, p[zone])
    }
  }
  return g
}

/** the DOM/audit fixtures, packaged as public built-in scenarios (ids stable so a
 *  server reseed updates rather than duplicates). Each is id-normalized so it loads
 *  as a fully playable board. */
export function builtinScenarios(): { id: string; name: string; state: GameState }[] {
  return [
    { id: 'builtin:board', name: 'Sandbox — base board', state: normalizeIds(board()) },
    { id: 'builtin:triggers', name: 'Sandbox — all elements (trigger board)', state: normalizeIds(triggerBoard()) },
    { id: 'builtin:abilities', name: 'Sandbox — ability targets', state: normalizeIds(abilityBoard()) },
  ]
}

/** place a site with a fake `fzs…` id (audit_playable-compatible). */
export function place(g: GameState, p: PlayerId, name: string, x: number, y: number): void {
  const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fzs${g.nextId++}`
  g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false } as any
}

/** summon a minion with a fake `fzu…` id (audit_playable-compatible; NOT targetable). */
export function summon(g: GameState, p: PlayerId, name: string, x: number, y: number): void {
  const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fzu${g.nextId++}`
  g.units[id] = { id, cardId, name, owner: p, controller: p, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
}

/** put a card into a hand with a fake `fzc…` id; returns the card id. */
export function inject(g: GameState, p: PlayerId, name: string): string {
  const id = `fzc${g.nextId++}`; g.cards[id] = { id, name, owner: p } as any
  g.players[p].hand.push(id); return id
}

/** put a card into a hand with an ENGINE-VALID `c…` id. The DOM audit MUST use
 *  this (not inject) for cards it casts: the client's projectile direction picker
 *  disambiguates a hand-cast from a unit ability via `mode.unitId.startsWith('c')`
 *  (Game.tsx shoot mode) — the fake `fzc…` id would misroute it as an `activate`.
 *  Returns the card id. DOM audit only. */
export function cinject(g: GameState, p: PlayerId, name: string): string {
  const id = newId(g, 'c'); g.cards[id] = { id, name, owner: p } as any
  g.players[p].hand.push(id); return id
}

/** summon a minion with an ENGINE-VALID `u…` id so it can be a spell/ability
 *  TARGET (the DOM driver clicks its chip). Returns the unit id. DOM audit only. */
export function usummon(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  const cardId = newId(g, 'c'); g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = newId(g, 'u')
  g.units[id] = { id, cardId, name, owner: p, controller: p, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
  return id
}

/** every square on the 5×4 realm — a convenience for target/summon enumeration. */
export const ALL_SQUARES: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = []
  for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) out.push({ x, y })
  return out
})()

// ---------------------------------------------------------------------------
// In-play scaffolding — the phase-2/3/4 boards from scripts/audit_playable.ts,
// extracted here VERBATIM so both audit_playable and the DOM-level audit share a
// single source of truth. audit_playable now imports these instead of defining
// its own copies; their behaviour is byte-identical to the originals.
// ---------------------------------------------------------------------------

/** one Ordinary element-source site per element, matching audit_playable's
 *  ELEM_SITE derivation (used to build a fully-affinity board for triggers and
 *  in-play abilities that gate on threshold). */
export const ELEM_SITE: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const el of ['air', 'earth', 'fire', 'water']) {
    const s = allCards.find(
      (c) => c.type === 'Site' && c.rarity === 'Ordinary' && (c.thresholds as any)[el] >= 1 && !getScript(c.name)?.siteProvides,
    )
    if (s) m[el] = s.name
  }
  return m
})()

const AFF_SPOTS: number[][] = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 2], [1, 3], [3, 0], [3, 3], [4, 0], [4, 1], [4, 2]]

/** board() plus three sites of every element, so response spells and threshold-
 *  gated abilities actually meet their affinity. (audit_playable phase 2/3.) */
export function triggerBoard(): GameState {
  const g = board()
  let i = 0
  for (const el of ['air', 'earth', 'fire', 'water']) {
    const name = ELEM_SITE[el]
    if (!name) continue
    for (let k = 0; k < 3; k++) {
      const [x, y] = AFF_SPOTS[i++] ?? [4, 3]
      place(g, 0, name, x, y)
    }
  }
  return g
}

/** triggerBoard() with real ability targets around BOTH placement spots — a
 *  minion placed at (2,0) and a site/artifact placed at (4,3) — so
 *  `adjacent`/`nearby`/`enemy` ability specs resolve. (audit_playable phase 3.) */
export function abilityBoard(): GameState {
  const g = triggerBoard()
  summon(g, 1, 'Foot Soldier', 3, 0)
  summon(g, 0, 'Foot Soldier', 1, 0) // around (2,0)
  summon(g, 1, 'Foot Soldier', 3, 3)
  summon(g, 0, 'Foot Soldier', 4, 2) // around (4,3)
  return g
}

/** place a card IN PLAY (minion at (2,0), site/artifact at (4,3)) with the fake
 *  `fz`-prefixed ids audit_playable phase 3 uses. Returns the in-play object id,
 *  or null for a type that has no in-play zone here (Magic/Aura). */
export function placeInPlay(g: GameState, name: string): string | null {
  const def = getCard(name)
  if (def.type === 'Minion') {
    const id = `fzu${g.nextId++}`; const cid = `fz${g.nextId++}`
    g.cards[cid] = { id: cid, name, owner: 0 } as any
    g.units[id] = { id, cardId: cid, name, owner: 0, controller: 0, isAvatar: false, x: 2, y: 0, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
    return id
  }
  if (def.type === 'Site') {
    const id = `fzs${g.nextId++}`; const cid = `fz${g.nextId++}`
    g.cards[cid] = { id: cid, name, owner: 0 } as any
    g.sites[id] = { id, cardId: cid, name, owner: 0, controller: 0, x: 4, y: 3, tapped: false, isRubble: false } as any
    return id
  }
  if (def.type === 'Artifact') {
    const id = `fza${g.nextId++}`; const cid = `fz${g.nextId++}`
    g.cards[cid] = { id: cid, name, owner: 0 } as any
    // standalone artifacts sit on a site square — place it at (4,3) (the site spot) so
    // it renders as a ground artifact in the client (the engine ignores x/y for a
    // standalone artifact's activation, so audit_playable is unaffected).
    g.artifacts[id] = { id, cardId: cid, name, owner: 0, conjuredBy: 0, x: 4, y: 3, region: 'surface', carriedBy: null, tapped: false, counters: {} } as any
    return id
  }
  return null
}

/** summon a minion with a fake `fzu…` id at a chosen square (audit_playable
 *  phase 4 combat helper). NOT engine-targetable (needs `u` prefix for that). */
export function mkUnit(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  const id = `fzu${g.nextId++}`; const cid = `fz${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: p } as any
  g.units[id] = { id, cardId: cid, name, owner: p, controller: p, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
  return id
}

/** the fake-id equivalent of usummon: an ENGINE-VALID `u…` minion placed IN PLAY
 *  at a chosen square (so the DOM driver can both click its chip AND target it). */
export function uPlaceInPlay(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  const cardId = newId(g, 'c'); g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = newId(g, 'u')
  g.units[id] = { id, cardId, name, owner: p, controller: p, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
  return id
}
