import { type EffectAPI } from '../registry'
import { pushLog, emitUnitEnters, newId } from '../../../engine/effects'
import type { UnitState } from '../../../engine/types'

// 'A site rises from the land itself as a minion.' (Horns of Behemoth / Island Leviathan)
export function transformSite(ctx: EffectAPI, floodRubble: boolean): void {
  const site = ctx.state.sites[ctx.sourceId]
  if (!site || site.controller === null) return
  const unitId = newId(ctx.state, 'u')
  const unit: UnitState = {
    id: unitId, cardId: site.cardId, name: site.name, owner: site.owner, controller: site.controller,
    isAvatar: false, x: site.x, y: site.y, region: 'surface', tapped: false, damage: 0,
    // FAQ: it was in the realm before this turn — no summoning sickness
    enteredTurn: ctx.state.turn - 1, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    // it TRANSFORMED from a site — it wasn't "summoned", so Order of the White Wing ignores it
    counters: { transformed: 1 },
  }
  ctx.state.units[unitId] = unit
  delete ctx.state.sites[site.id]
  // rubble underneath — the awakened thing needs somewhere to stand
  const rubbleCardId = newId(ctx.state, 'c')
  ctx.state.cards[rubbleCardId] = { id: rubbleCardId, name: 'Rubble', owner: site.owner, isToken: true }
  const rubbleId = newId(ctx.state, 's')
  ctx.state.sites[rubbleId] = {
    id: rubbleId, cardId: rubbleCardId, name: 'Rubble', owner: site.owner, controller: null,
    x: site.x, y: site.y, tapped: false, isRubble: true, flooded: floodRubble || undefined,
  }
  pushLog(ctx.state, site.controller, `🌋 ${site.name} rises from the land itself!`)
  emitUnitEnters(ctx.state, unit)
}
