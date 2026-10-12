import { registerScript, type EffectAPI } from '../registry'
import { pushLog, killUnit, checkStateBased } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import type { UnitState } from '../../../engine/types'

// 'Minions below nearby sites die.'
registerScript('Sea of Ash', {
  onUnitEntersSquare: (ctx, moved) => seaOfAshCheck(ctx, moved),
  startOfEachTurn: (ctx) => {
    for (const u of Object.values(ctx.state.units)) seaOfAshCheck(ctx, u)
  },
})

function seaOfAshCheck(ctx: EffectAPI, u: UnitState): void {
  const self = ctx.state.sites[ctx.sourceId]
  if (!self || u.isAvatar || (u.region !== 'underground' && u.region !== 'underwater')) return
  if (!ctx.state.units[u.id]) return
  if (nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y) && siteAt(ctx.state, u.x, u.y)) {
    pushLog(ctx.state, ctx.controller, `${u.name} chokes in the ash below.`)
    killUnit(ctx.state, u.id)
    checkStateBased(ctx.state)
  }
}
