// Shared helpers for Chaos Twister and Erik's Curiosa (no registerScript — skipped by gen:card-index).

import { type EffectAPI } from '../registry'
import { GRID_W, GRID_H, unitsAt, siteAt, squareLabel } from '../../../engine/grid'
import { effAttack, collectionNames, takeFromCollection } from '../../../engine/statics'
import { mulberry32 } from '../../../engine/rng'
import { pushLog } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'
import type { GameState } from '../../../engine/types'

export type BlowDirection = 'n' | 's' | 'e' | 'w'

/** the wedge of squares "downwind" of origin in the given direction */
export function coneSquares(origin: { x: number; y: number }, dir: BlowDirection): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      const dx = x - origin.x
      const dy = y - origin.y
      const inCone =
        dir === 'e' ? dx >= 1 && Math.abs(dy) <= dx :
        dir === 'w' ? -dx >= 1 && Math.abs(dy) <= -dx :
        dir === 'n' ? dy >= 1 && Math.abs(dx) <= dy :
        -dy >= 1 && Math.abs(dx) <= -dy
      if (inCone) out.push({ x, y })
    }
  }
  return out
}

/** one 50/20/30 roll → landing square or null (off the board).
 *  The minion crashes down on ANY square — a site (it deals damage there) OR a void square (a siteless
 *  square: FAQ says it deals no damage and is banished unless it has Voidwalk) — or it sails clean off
 *  the board (null). Was sites-only, so a minion could never be blown into the void. */
export function rollLanding(state: GameState, cone: { x: number; y: number }[]): { x: number; y: number } | null {
  const inCone = cone // every downwind square, whether or not it holds a site
  const outCone: { x: number; y: number }[] = []
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      if (!cone.some((c) => c.x === x && c.y === y)) outCone.push({ x, y })
    }
  }
  const rnd = mulberry32(state.seed)
  const roll = rnd()
  let landing: { x: number; y: number } | null = null
  if (roll < 0.5 && inCone.length > 0) {
    landing = inCone[Math.floor(rnd() * inCone.length)]!
  } else if (roll < 0.7 && outCone.length > 0) {
    landing = outCone[Math.floor(rnd() * outCone.length)]!
  }
  state.seed = Math.floor(rnd() * 0xffffffff)
  return landing ? { x: landing.x, y: landing.y } : null
}

export function landingLabel(landing: { x: number; y: number } | null): string {
  return landing ? `lands at ${squareLabel(landing.x, landing.y)}` : 'flies off the board'
}

export function applyLanding(ctx: EffectAPI, minionId: string, landing: { x: number; y: number } | null): void {
  const state = ctx.state as GameState
  const minion = state.units[minionId]
  if (!minion) return
  if (!landing) {
    pushLog(state, null, `${minion.name} tumbles off the realm entirely and is banished!`)
    ctx.banish(minion.id)
    return
  }
  // Lands in the VOID — a square with no site. FAQ: "It deals no damage (even to itself). Since it's
  // now in the void, it is banished (unless it has Voidwalk)." A genuine teleport onto a siteless square
  // drops the unit into the void region; checkStateBased then banishes it (or Voidwalk lets it drift there).
  if (!siteAt(state, landing.x, landing.y)) {
    ctx.teleport(minion.id, landing.x, landing.y, 'surface')
    const survived = !!state.units[minion.id]
    pushLog(state, null, survived
      ? `${minion.name} is flung into the void at ${squareLabel(landing.x, landing.y)} and drifts there.`
      : `${minion.name} is flung into the void at ${squareLabel(landing.x, landing.y)} — with no ground beneath it, it is banished!`)
    return
  }
  const power = effAttack(state, minion)
  ctx.teleport(minion.id, landing.x, landing.y, 'surface')
  pushLog(state, null, `${minion.name} crashes down at ${squareLabel(landing.x, landing.y)}!`)
  // Death blow — the crash lands on a site holding the caster's enemies (kill a minion / hit the avatar)
  const victims = unitsAt(state, landing.x, landing.y, 'surface').filter((u) => u.id !== minion.id && u.controller !== ctx.controller)
  const avatarHit = power > 0 && victims.some((u) => u.isAvatar)
  for (const u of unitsAt(state, landing.x, landing.y, 'surface')) {
    ctx.dealDamage({ unit: u.id }, power)
  }
  ctx.settleDeaths() // resolve the crash's deaths before checking whether a minion actually died (achievement)
  const minionKilled = victims.some((u) => !u.isAvatar && !state.units[u.id])
  if (avatarHit || minionKilled) awardAchievement(state, 'death-blow-twister', ctx.controller)
}

/** take one copy of `name` from the caster's collection into their hand (no shared-log name leak). */
export function curiosaDraw(ctx: EffectAPI, name: string): void {
  if (!collectionNames(ctx.state, ctx.controller).includes(name)) return
  takeFromCollection(ctx.state, ctx.controller, name)
  const cardId = `c${ctx.state.nextId++}`
  ctx.state.cards[cardId] = { id: cardId, name, owner: ctx.controller }
  ctx.state.players[ctx.controller].hand.push(cardId)
  pushLog(ctx.state, ctx.controller, `${ctx.state.players[ctx.controller].name} draws a card from their collection.`)
}
