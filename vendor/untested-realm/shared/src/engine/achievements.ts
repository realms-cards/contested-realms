// Secret achievements. Detection is a PURE post-action pass — `applyAchievements(prev,next,actor,action)`
// diffs the settled state against a pre-action snapshot and appends any freshly-earned unlocks to
// `next.flow.achievements` (once per game, keyed by id+seat). It is deliberately NOT wired into
// applyAction: the search bot applies thousands of hypothetical actions and must never pay this cost
// nor mint phantom unlocks. Instead the three REAL apply sites (local play, the bot's own move, and
// the online server) call it explicitly, each of which already snapshots the prior state.
//
// Each unlock is attributed to the SEAT that earned it (the doer, or — for "watch your opponent do X"
// feats — the observer). viewFor redacts the other seat's entries so an unlock name never leaks hidden
// information mid-game online.

import type { GameState, PlayerId, Action, UnitState } from './types'
import { getCard } from '../cards/db'
import { avatarOf, occupiedSquares } from './grid'
import { effAttack, cardSubtypesFor } from './statics'
import { affinity } from './casting'
import { BY_ID, type AchvUnlock } from './achievements.catalog'

export * from './achievements.catalog'

const GRID_W = 5
const GRID_H = 4
const other = (s: PlayerId): PlayerId => (s === 0 ? 1 : 0) as PlayerId

/** the non-rubble site sitting on a square (regions share the surface footprint) */
function siteAt(state: GameState, x: number, y: number) {
  return Object.values(state.sites).find((s) => s.x === x && s.y === y && !s.isRubble)
}

/** does a card of this name currently exist in play (unit / artifact / site)? */
function inPlay(state: GameState, name: string): boolean {
  return (
    Object.values(state.units).some((u) => u.name === name) ||
    Object.values(state.artifacts).some((a) => a.name === name) ||
    Object.values(state.sites).some((s) => s.name === name && !s.isRubble)
  )
}

function safeSubtypes(state: GameState, u: UnitState): string[] {
  try { return cardSubtypesFor(state, u.controller, u.name) } catch { return getCard(u.name)?.subtypes ?? [] }
}

/** deepest chain of carried units rooted at this unit (1 = just itself) */
function carryDepth(state: GameState, u: UnitState, guard = 0): number {
  if (guard > 12) return 1
  const kids = u.carryingUnits ?? []
  let best = 1
  for (const id of kids) {
    const c = state.units[id]
    if (c) best = Math.max(best, 1 + carryDepth(state, c, guard + 1))
  }
  return best
}

interface Scratch {
  turn: number
  lifeTop: Record<number, number>
  craterizeTurn: Record<number, number>
  everLow: Record<number, boolean>
  bolts: Record<string, number>
  blinks: Record<string, number>
}
function scratchFor(next: GameState): Scratch {
  const f = (next.flow ??= {})
  let s: Scratch | undefined = f.achvScratch
  if (!s) { s = f.achvScratch = { turn: next.turn, lifeTop: {}, craterizeTurn: {}, everLow: {}, bolts: {}, blinks: {} } }
  if (s.turn !== next.turn) {
    // reset turn-scoped tallies; keep game-scoped ones (craterize streak, everLow)
    s.turn = next.turn
    s.lifeTop = {}
    s.bolts = {}
    s.blinks = {}
  }
  return s
}

/**
 * Detect and record achievements earned by the transition prev → next (caused by `actor`'s `action`).
 * Mutates next.flow.achievements. Returns the freshly-unlocked entries (for an immediate toast).
 * Never throws: a detector bug must never break a game.
 */
export function applyAchievements(prev: GameState, next: GameState, actor: PlayerId, action: Action): AchvUnlock[] {
  const fresh: AchvUnlock[] = []
  try {
    const f = (next.flow ??= {})
    const list: AchvUnlock[] = (f.achievements ??= [])
    const has = (id: string, seat: PlayerId) => list.some((u) => u.id === id && u.seat === seat)
    const add = (id: string, seat: PlayerId) => {
      if (!BY_ID[id] || has(id, seat)) return
      const u: AchvUnlock = { id, seat, turn: next.turn }
      list.push(u)
      fresh.push(u)
    }
    detect(prev, next, actor, action, add)
  } catch { /* achievements are cosmetic — never let detection break play */ }
  return fresh
}

function detect(prev: GameState, next: GameState, actor: PlayerId, action: Action, add: (id: string, seat: PlayerId) => void): void {
  const seats: PlayerId[] = [0, 1]
  const s = scratchFor(next)
  const deltaLog = (next.log ?? []).slice(prev.log?.length ?? 0)
  const logHas = (needle: string) => deltaLog.some((e) => e.msg.includes(needle))

  // ── per-seat "you control / you did" board states ──────────────────────────────
  for (const seat of seats) {
    // 7 Wonders — 7 Monuments controlled
    const monuments = Object.values(next.sites).filter(
      (st) => st.controller === seat && !st.isRubble && (getCard(st.name)?.subtypes ?? []).includes('Monument'),
    ).length
    if (monuments >= 7) add('seven-wonders', seat)

    // Biblical plague — 6+ Locusts controlled
    const locusts = Object.values(next.units).filter((u) => u.controller === seat && u.name.includes('Locust')).length
    if (locusts >= 6) add('biblical-plague', seat)

    // True elementalist — 4+ threshold of EVERY element at once
    try {
      const a = affinity(next, seat)
      if (a.air >= 4 && a.earth >= 4 && a.fire >= 4 && a.water >= 4) add('true-elementalist', seat)
    } catch { /* affinity is best-effort */ }

    // Mass desertion — took control of MORE THAN 3 enemy minions in this single action (controller is
    // this seat but the card is OWNED by the foe). Compare the count before/after.
    const stolen = (g: GameState) => Object.values(g.units).filter((u) => !u.isAvatar && u.controller === seat && u.owner === other(seat)).length
    if (stolen(next) - stolen(prev) > 3) add('mass-desertion', seat)

    // Now you're tall enough for Stacy — this seat stretched the ENEMY avatar over 3+ sites
    const foeAv = avatarOf(next, other(seat))
    if (foeAv && occupiedSquares(foeAv).filter((sq) => siteAt(next, sq.x, sq.y)).length >= 3) add('tall-for-stacy', seat)

    // The reunion — 10+ objects on one square, 6+ this seat's
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) {
      const units = Object.values(next.units).filter((u) => occupiedSquares(u).some((sq) => sq.x === x && sq.y === y))
      const arts = Object.values(next.artifacts).filter((a) => a.x === x && a.y === y)
      const auras = Object.values(next.auras).filter((a) => (a.squares ?? []).some((sq) => sq.x === x && sq.y === y))
      const total = units.length + arts.length + auras.length
      if (total < 10) continue
      const mine =
        units.filter((u) => u.controller === seat).length +
        arts.filter((a) => (a.carriedBy ? next.units[a.carriedBy]?.controller : a.conjuredBy) === seat).length +
        auras.filter((a) => a.controller === seat).length
      if (mine >= 6) add('the-reunion', seat)
    }
  }

  // Gigamoeba / whos-avatar-now / horse-tower — per unit
  for (const u of Object.values(next.units)) {
    if ((u.name === 'Megamoeba' || u.name === 'Aethermoeba') && occupiedSquares(u).length >= 10) add('gigamoeba', u.controller)
    // Is this man eater bug? — Vivien copied the Druid's flip ability and flipped HERSELF into a
    // useless flipped card (she has no back side).
    if (u.name === 'Vivien the Enchantress' && u.flipped) add('man-eater-bug', u.controller)
    if (!u.isAvatar && effAttack(next, u) > 20) add('whos-avatar-now', u.controller)
    if (carryDepth(next, u) >= 3) add('horse-tower', u.controller)
    // Amelia the witch — a Broomstick Witch standing on the Vesuvius
    if (u.name === 'Broomstick Witch' && siteAt(next, u.x, u.y)?.name === 'Vesuvius') add('amelia-witch', u.controller)
  }

  // Emperor is naked — an enemy avatar lost 4+ carried artifacts in this action
  for (const seat of seats) {
    const before = avatarOf(prev, other(seat))
    const after = avatarOf(next, other(seat))
    if (before && after && (before.carrying?.length ?? 0) - (after.carrying?.length ?? 0) >= 4) add('emperor-naked', seat)
  }

  // Trypophobia — every square holds a site
  {
    let all = true
    for (let x = 0; x < GRID_W && all; x++) for (let y = 0; y < GRID_H; y++) if (!siteAt(next, x, y)) { all = false; break }
    if (all) add('trypophobia', actor)
  }

  // Back together — Meat Hook carried by the Pudge Butcher
  for (const a of Object.values(next.artifacts)) {
    if (a.name === 'Meat Hook' && a.carriedBy) {
      const carrier = next.units[a.carriedBy]
      if (carrier?.name === 'Pudge Butcher') add('back-together', carrier.controller)
    }
  }

  // Cock sorcery — 2+ avatars under one Makeshift Barricade
  for (const aura of Object.values(next.auras)) {
    if (aura.name !== 'Makeshift Barricade') continue
    const covered = Object.values(next.units).filter(
      (u) => u.isAvatar && (aura.squares ?? []).some((sq) => sq.x === u.x && sq.y === u.y),
    ).length
    if (covered >= 2) add('cock-sorcery', actor)
  }

  // Site-share weddings
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) {
    const site = siteAt(next, x, y)
    const here = Object.values(next.units).filter((u) => u.x === x && u.y === y)
    if (site?.name === 'Wedding Hall') {
      // avatar + Finwife
      const av = here.find((u) => u.isAvatar)
      if (av && here.some((u) => u.name === 'Finwife')) add('finwife-wedding', av.controller)
      // 2+ kings / sirs / knights
      const royals = here.filter((u) => {
        const st = safeSubtypes(next, u)
        return st.includes('King') || st.includes('Knight') || /\bSir\b/.test(u.name)
      })
      if (royals.length >= 2) add('gay-marriage', royals[0].controller)
    } else if (site) {
      // Arthur + Guinevere on a non-Wedding-Hall site
      const arthur = here.find((u) => u.name === 'King Arthur')
      if (arthur && here.some((u) => u.name === 'Queen Guinevere')) add('weird-marriage', arthur.controller)
    }
  }

  // ── entering-the-realm feats (ids present in next but not prev) ─────────────────
  const prevUnits = prev.units ?? {}
  for (const id of Object.keys(next.units)) {
    if (prevUnits[id]) continue
    const u = next.units[id]
    if (u.name === 'Yog-Sothoth') { add('sotother', u.controller); add('roll-sanity', other(u.controller)) }
    // Your spellbook? Our spellbook! — a minion you summoned from the OPPONENT's deck (Lilith seduces
    // their top spell; it enters owner=foe, controller=you). A cast from the foe's deck is caught below.
    if (u.owner === other(u.controller)) add('our-spellbook', u.controller)
    // Promotion denied! — a Mephistopheles that entered by any means OTHER than a cast (his castRider
    // takeover only fires on a real cast) never replaced the Avatar, so he's still a plain minion.
    if (u.name === 'Mephistopheles' && !u.isAvatar) add('promotion-denied', u.controller)
    // Buried, not destroyed — a minion summoned subsurface by an Omphalos there, that survived settle
    if (!u.isAvatar && (u.region === 'underground' || u.region === 'underwater')) {
      const omphHere = Object.values(next.artifacts).some(
        (a) => /Omphalos/.test(a.name) && a.x === u.x && a.y === u.y && (a.region === 'underground' || a.region === 'underwater'),
      )
      if (omphHere) add('buried-not-destroyed', u.controller)
    }
    if (u.name === 'Lugbog Cat') {
      const site = siteAt(next, u.x, u.y)
      const foe = other(u.controller)
      const foeAvHere = Object.values(next.units).some((o) => o.isAvatar && o.controller === foe && o.x === u.x && o.y === u.y)
      if (site && site.controller === foe && foeAvHere) add('cat-in-face', u.controller)
    }
  }

  // ── things leaving play (in prev, gone from next) ──────────────────────────────
  if (inPlay(prev, 'Roots of Yggdrasil') && !inPlay(next, 'Roots of Yggdrasil')) add('tree-hater', actor)
  if (inPlay(prev, 'Boulevard of Bones') && !inPlay(next, 'Boulevard of Bones')) add('boulevard-broken', actor)
  if (inPlay(prev, 'Magellan Globe') && !inPlay(next, 'Magellan Globe')) add('flat-earther', actor)

  // ── log / action driven ────────────────────────────────────────────────────────
  if (logHas("rips Erik's Curiosa")) add('rip-curiosa', actor)

  // Dinosaur killer — Craterize on consecutive OWN turns (own turns are 2 apart)
  if (logHas('Craterize')) {
    const last = s.craterizeTurn[actor]
    if (last !== undefined && next.turn - last === 2) add('dinosaur-killer', actor)
    s.craterizeTurn[actor] = next.turn
  }

  // La Situa — 5+ cards drawn off a Necronomiconcert this action
  if (logHas('Necronomiconcert')) {
    let drawn = 0
    for (const e of deltaLog) {
      if (e.player === actor && /\bdraw/i.test(e.msg)) {
        const m = e.msg.match(/(\d+)/)
        drawn += m ? parseInt(m[1], 10) : 1
      }
    }
    if (drawn >= 5) add('la-situa', actor)
  }

  // Your spellbook? Our spellbook! — casting a card OWNED by the opponent (Captain Baldassarre &c.)
  if (action.t === 'castSpell') {
    const owner = next.cards[action.cardId]?.owner ?? prev.cards[action.cardId]?.owner
    if (owner !== undefined && owner === other(actor)) add('our-spellbook', actor)
  }

  // Top 10 anime betrayals — a minion you took via Betrayal (marked counters.betrayed) attacks the
  // enemy Avatar. Its owner is the foe, so it's turning on its own side.
  if (action.t === 'moveAttack' && action.attack && 'unit' in action.attack) {
    const attacker = next.units[action.unitId] ?? prev.units[action.unitId]
    const victim = prev.units[action.attack.unit] ?? next.units[action.attack.unit]
    if (attacker && victim?.isAvatar && victim.controller === other(actor) && attacker.counters?.betrayed === actor) add('anime-betrayals', actor)
  }

  // Lightning Bolt / Blink repeats keyed off the cast action's target
  if (action.t === 'castSpell') {
    const name = next.cards[action.cardId]?.name ?? prev.cards[action.cardId]?.name
    if (name === 'Lightning Bolt') {
      const key = action.targets?.[0] ?? (action.at ? `${action.at.x},${action.at.y}` : '?')
      s.bolts[key] = (s.bolts[key] ?? 0) + 1
      if (s.bolts[key] >= 2) add('bolt-twice', actor)
    }
    if (name === 'Blink' && action.targets?.[0]) {
      const key = action.targets[0]
      s.blinks[key] = (s.blinks[key] ?? 0) + 1
      if (s.blinks[key] >= 2) add('blink-182', actor)
    }
  }

  // ── life-track feats ───────────────────────────────────────────────────────────
  for (const seat of seats) {
    const av = avatarOf(next, seat)
    const life = av?.life
    if (typeof life === 'number') {
      s.lifeTop[seat] = Math.max(s.lifeTop[seat] ?? -Infinity, life)
      if (life <= 5 || av?.deathsDoor) s.everLow[seat] = true
      // Call an ambulance — hit 20+ then bottomed out to 0 in the same turn
      if (life <= 0 && (s.lifeTop[seat] ?? 0) >= 20) add('call-an-ambulance', seat)
    }
  }

  // Why are you hitting yourself? — on a turn your opponent PILOTS you (Courtesan Thaïs sets
  // flow.thaisActive to the controlled seat), that seat's avatar reaches death's door or dies.
  {
    const t = next.flow?.thaisActive
    if (t === 0 || t === 1) {
      const before = avatarOf(prev, t as PlayerId); const after = avatarOf(next, t as PlayerId)
      const nowDown = !after || after.deathsDoor || (after.life ?? 1) <= 0
      const wasDown = !!before && (before.deathsDoor || (before.life ?? 1) <= 0)
      if (nowDown && !wasDown) add('hitting-yourself', t as PlayerId)
    }
  }

  // The nuclear option — the game ends in a DRAW (both Avatars felled by one simultaneous source)
  // and that source was a blast (Craterize / Doomsday / Holy Nova / an "explosion").
  if (!prev.draw && next.draw && /Craterize|Doomsday|Holy Nova|[Ee]xplosion/.test(deltaLog.map((e) => e.msg).join('\n'))) {
    add('nuclear-option', 0); add('nuclear-option', 1)
  }

  // winners
  if (prev.winner === null && next.winner !== null) {
    const w = next.winner
    if (s.everLow[w]) add('but-not-for-me', w)
    // Solo leveling — win with a level-8 Immortal Throne on the board
    const throne = [...Object.values(next.sites), ...Object.values(next.units)].find((o: any) => o.name === 'The Immortal Throne')
    const level = (throne as any)?.counters?.level ?? (throne as any)?.counters?.levels
    if (typeof level === 'number' && level >= 8) add('solo-leveling', w)
  }
}
