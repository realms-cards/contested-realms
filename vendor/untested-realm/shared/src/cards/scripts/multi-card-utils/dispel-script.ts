import { type EffectAPI } from '../registry'
import { siteAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { pushLog, checkStateBased, toCemetery } from '../../../engine/effects'
import { squaresWithinSteps } from './step-range-targets'
import type { GameState } from '../../../engine/types'

// Auras whose flood is part of their continuous effect (Atlantean Fate, Flood):
// covered sites are flooded while the aura is in play and MUST un-flood when the
// aura leaves (dispel / destroy / banish). `applyFlood` sets a sticky per-site flag,
// so the removal paths call this to revert sites this aura flooded -- unless another
// flooding aura still covers them.
const FLOODING_AURAS = new Set(['Atlantean Fate', 'Flood'])

export function unfloodOnAuraLeave(state: GameState, leaving: { id: string; name: string; squares: { x: number; y: number }[] }) {
  if (!FLOODING_AURAS.has(leaving.name)) return
  for (const sq of leaving.squares) {
    const site = siteAt(state, sq.x, sq.y)
    if (!site || !site.flooded) continue
    // keep flooded if some OTHER flooding aura still covers this square
    const stillFlooded = Object.values(state.auras).some(
      (a) => a.id !== leaving.id && FLOODING_AURAS.has(a.name) && a.squares.some((s) => s.x === site.x && s.y === site.y),
    )
    if (!stillFlooded) site.flooded = undefined
  }
}

// 'Destroy all auras and artifacts at target location up to two steps away.'
export const dispelScript = {
  targets: [{ what: 'square' as const, count: 1, targeted: true, label: 'target location (≤2 steps)' }],
  targetOptions: (state: GameState, caster: import('../../../engine/types').UnitState) => squaresWithinSteps(state, caster, 2), // client-blockable range
  onCast: (ctx: EffectAPI) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const caster = ctx.caster!
    if (realStepDistanceW(ctx.state, caster, t.square) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.x === t.square.x && a.y === t.square.y) ctx.breakArtifact(a.id)
    }
    for (const r of Object.values(ctx.state.auras)) {
      if (r.squares.some((s) => s.x === t.square.x && s.y === t.square.y)) {
        const card = ctx.state.cards[r.cardId]
        // if this aura is currently ANIMATED as a minion (Enchantress), its shared card is
        // sent to the cemetery when that minion dies -- which checkStateBased does immediately
        // now that the aura is gone. Don't also push it here, or the card lands twice.
        const animated = Object.values(ctx.state.units).some((u) => String(u.counters?.animatedAura ?? '') === r.id)
        if (card && !animated) toCemetery(ctx.state, card.id)
        unfloodOnAuraLeave(ctx.state, r)
        delete ctx.state.auras[r.id]
        pushLog(ctx.state, ctx.controller, `${r.name} is dispelled.`)
      }
    }
    checkStateBased(ctx.state) // an animated aura just dispelled → its minion dies at once
  },
}
