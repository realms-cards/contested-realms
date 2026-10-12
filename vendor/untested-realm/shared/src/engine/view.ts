// Build the state a given player is allowed to see: opponent hands and both
// decks are hidden (only counts survive). Spectators see everything public.

import type { GameState, PlayerId } from './types'
import { isDisabled } from './statics'
import { getScript } from '../cards/scripts/registry'
import { effectiveCost } from './casting'
import { avatarOf } from './grid'
import { getCard } from '../cards/db'

export interface PlayerView extends Omit<GameState, 'players' | 'cards' | 'seed'> {
  players: any[]
  cards: Record<string, { id: string; name: string; owner: PlayerId; isToken?: boolean; art?: string }>
  /** the id of the viewing player, or null for spectators */
  you: PlayerId | null
}

export function viewFor(state: GameState, player: PlayerId | null, opts?: { revealAll?: boolean }): PlayerView {
  const visibleCardIds = new Set<string>()

  // realm objects are public
  for (const u of Object.values(state.units)) visibleCardIds.add(u.cardId)
  for (const s of Object.values(state.sites)) visibleCardIds.add(s.cardId)
  for (const a of Object.values(state.artifacts)) visibleCardIds.add(a.cardId)
  for (const r of Object.values(state.auras)) visibleCardIds.add(r.cardId)
  // cemeteries and banished cards are public
  for (const p of state.players) {
    for (const id of p.cemetery) visibleCardIds.add(id)
    for (const id of p.banished) visibleCardIds.add(id)
  }
  // your own hand is visible to you
  if (player !== null) {
    for (const id of state.players[player].hand) visibleCardIds.add(id)
    // ...as are opponent hand cards you've been shown (Lookout, Accusation, ...)
    for (const p of state.players) {
      if (p.id === player) continue
      for (const id of p.hand) if (state.handReveals?.[id]?.includes(player)) visibleCardIds.add(id)
    }
  }
  // replay / god view (a finished game being watched back): every hand is public
  if (opts?.revealAll) for (const p of state.players) for (const id of p.hand) visibleCardIds.add(id)

  // Doomsday Cult — "Players play with the top card of their spellbook revealed." While any live
  // (un-silenced, un-disabled) Cult sits in the realm, BOTH players' spellbook-top cards are PUBLIC.
  // Expose each top's id (+ its card data below) so every viewer can see it — and the owner can take
  // up an Evil minion from it via the avatar's granted Cult ability.
  const cultInPlay = Object.values(state.units).some(
    (u) => u.name === 'Doomsday Cult' && !u.silenced && !isDisabled(state, u),
  )
  const spellbookTops: (string | undefined)[] = state.players.map((p) => {
    const top = cultInPlay ? p.spellbook[0] : undefined
    if (top !== undefined) visibleCardIds.add(top)
    return top
  })

  const cards: PlayerView['cards'] = {}
  for (const id of visibleCardIds) {
    const c = state.cards[id]
    if (c) cards[id] = c
  }

  // SITE TRAPS (anti-cheat): a face-down trap is stored AS its disguise basic site (site.name) with the
  // real identity in site.trap. Reveal the real card ONLY to the trap's owner. For everyone else — the
  // opponent AND spectators — trim site.trap to { element } and overwrite the card entry behind
  // site.cardId with the disguise, so the real name/art never crosses the wire. site.name is already the
  // basic site, so the board renders the disguise for all; only the owner's client learns realName.
  const sites: Record<string, GameState['sites'][string]> = {}
  for (const [id, s] of Object.entries(state.sites)) {
    if (s.trap && !opts?.revealAll && !(player !== null && player === s.owner)) {
      sites[id] = { ...s, trap: { element: s.trap.element } }
      const disguise = cards[s.cardId]
      if (disguise) cards[s.cardId] = { ...disguise, name: s.name, art: undefined }
    } else {
      sites[id] = s
    }
  }

  const players = state.players.map((p) => {
    const mine = player !== null && p.id === player
    return {
      id: p.id,
      name: p.name,
      avatarUnitId: p.avatarUnitId,
      mana: p.mana,
      manaSpent: state.flow?.manaSpent?.[p.id] ?? 0, // this turn — total = mana + manaSpent
      keptHand: p.keptHand,
      cemetery: p.cemetery,
      banished: p.banished,
      hand: (mine || opts?.revealAll) ? p.hand : p.hand.map((id) => (player !== null && state.handReveals?.[id]?.includes(player) ? id : 'hidden')),
      handCounts: countHand(state, p.hand, p.id),
      // per-hand-card UNCONDITIONAL mana-cost delta (effective − printed, computed with NO cast
      // location so location-conditional discounts are excluded — e.g. Court of Equity's +1/+2).
      // Only your OWN hand (opponent cards are hidden); only non-zero, non-site entries.
      handCostDelta: mine ? handCostDeltas(state, p.id) : {},
      atlasCount: p.atlas.length,
      spellbookCount: p.spellbook.length,
      spellbookTop: spellbookTops[p.id], // revealed top card id (Doomsday Cult) — undefined otherwise

      collection: mine ? p.collection : {}, // your fetch pool is your own to see
      collectionCount: Object.values(p.collection).reduce((a, b) => a + b, 0),
    }
  })

  // prompts: only the addressed player sees the details. `cont`/`ctx` (the
  // continuation key + its captured context: sourceId, earlier direction picks…)
  // are the caster's OWN cast bookkeeping — exposed only to the addressed player so
  // the client can pre-compute the area-damage confirmation grid for directional
  // grid spells (Lava Flow, Cone of Flame, Firebreathing, Flame Wave, Burning
  // Hands, Day of Judgment). Kept off the opponent's view (never leaks hidden refs).
  const prompts = state.prompts.slice(0, 1).map((pr) => ({
    id: pr.id,
    player: pr.player,
    kind: pr.kind,
    title: pr.title,
    data: player === pr.player ? pr.data : {},
    cont: player === pr.player ? pr.cont : '',
    ctx: player === pr.player ? pr.ctx : undefined,
  }))

  return {
    version: state.version,
    turn: state.turn,
    activePlayer: state.activePlayer,
    phase: state.phase,
    firstPlayer: state.firstPlayer,
    players,
    cards,
    units: state.units,
    sites,
    artifacts: state.artifacts,
    auras: state.auras,
    prompts: prompts as any,
    log: state.log.slice(-200),
    winner: state.winner,
    draw: state.draw,
    nextId: 0,
    interject: state.interject ?? null,
    // transient effect flags: needed client-side for board hints (Harbinger
    // portents, summon windows...). Card ids inside stay opaque — the cards
    // map above is filtered to visible cards. The Dragonlord's set-aside dragon is
    // HIDDEN info, so a viewer only ever sees their OWN pick (never the opponent's).
    flow: (() => {
      const f: any = { ...(state.flow ?? {}) }
      if (f.dragonlordPick) {
        const mine: Record<number, string> = {}
        if (player !== null && f.dragonlordPick[player]) mine[player] = f.dragonlordPick[player]
        f.dragonlordPick = mine
      }
      // Achievement unlocks are attributed to a seat; a viewer only sees their OWN (the cheeky
      // unlock names could otherwise leak hidden info to the opponent mid-game online). Spectators
      // see none. The internal per-turn scratch tallies never leave the server.
      delete f.achvScratch
      if (Array.isArray(f.achievements)) f.achievements = f.achievements.filter((u: any) => u.seat === player)
      return f
    })(),
    clock: state.clock,
    lastPlay: state.lastPlay,
    you: player,
  }
}

/** opponents may know how many sites vs spells you hold (card backs differ) — EXCEPT against a
 *  Magician (sitesInSpellbook), whose sites and spells share one deck/back: only the TOTAL count is
 *  revealed, never the split (returned as `{ sites: 0, spells: total, mixed: true }`). */
function countHand(state: GameState, hand: string[], ownerId: PlayerId): { sites: number; spells: number; mixed?: boolean } {
  // cards that physically sit in the hand but aren't a normal held card don't
  // count toward the hand size: a Pith-Imp-stolen spell (sealed while the thief
  // lives) and caster-locked cards lent by Omphalos / Morgana / Gabriel. They
  // still SHOW in the owner's hand (as sealed/locked), they just aren't counted.
  const uncounted = new Set<string>()
  for (const s of (state.flow?.stolen ?? []) as { cardId: string; unitId: string }[]) {
    if (state.units[s.unitId]) uncounted.add(s.cardId)
  }
  for (const l of (state.flow?.lockedCards ?? []) as { cardId: string }[]) uncounted.add(l.cardId)

  let sites = 0
  let spells = 0
  for (const id of hand) {
    if (uncounted.has(id)) continue
    const c = state.cards[id]
    if (!c) continue
    // avoid importing db here: site-ness is derivable client-side from name lookup,
    // but counts must not leak names — compute server-side
    sites += isSiteName.has(c.name) ? 1 : 0
    spells += isSiteName.has(c.name) ? 0 : 1
  }
  // Magician: sites live in the spellbook and share the spell back — reveal only the total, so the
  // opponent can't tell how many of the cards in hand are sites vs spells.
  const avatarName = state.units[state.players[ownerId]?.avatarUnitId ?? '']?.name
  if (avatarName && getScript(avatarName)?.sitesInSpellbook) return { sites: 0, spells: sites + spells, mixed: true }
  return { sites, spells }
}

import { allCards } from '../cards/db'
const isSiteName = new Set(allCards.filter((c) => c.type === 'Site').map((c) => c.name))

/** For each SPELL in the player's hand, the unconditional mana-cost change vs its printed cost
 *  (effective cost with NO cast location → location-conditional discounts don't count). Returns only
 *  non-zero entries, keyed by card id, so the client can badge "+2 ◆" / "−1 ◆" on the card in hand. */
function handCostDeltas(state: GameState, player: PlayerId): Record<string, number> {
  const out: Record<string, number> = {}
  const avatar = avatarOf(state, player)
  if (!avatar) return out
  for (const id of state.players[player].hand) {
    const c = state.cards[id]
    if (!c) continue
    try {
      const def = getCard(c.name)
      if (def.type === 'Site') continue // sites are played, not cast — cost mods don't apply
      const delta = effectiveCost(state, player, c.name, avatar, undefined, id) - (def.cost ?? 0)
      if (delta !== 0) out[id] = delta
    } catch { /* unknown/odd hand card — just skip its badge */ }
  }
  return out
}
