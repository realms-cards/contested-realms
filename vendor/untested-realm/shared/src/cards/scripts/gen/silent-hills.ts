import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Genesis → Until your next turn, minions are silenced while atop nearby sites.'
registerScript('Silent Hills', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.silentHills = [...(ctx.state.flow.silentHills ?? []), { siteId: ctx.sourceId, player: ctx.controller, turn: ctx.state.turn }]
    pushLog(ctx.state, ctx.controller, 'An unnatural hush falls over the hills.')
  },
  silencesUnit: (state, selfId, unit) => {
    const active = (state.flow?.silentHills ?? []).some((e: any) => e.siteId === selfId)
    if (!active || unit.isAvatar || unit.region !== 'surface') return false
    const self = state.sites[selfId]
    if (!self) return false
    return !!siteAt(state, unit.x, unit.y) && nearbySquaresW(state, self.x, self.y).some((s) => s.x === unit.x && s.y === unit.y)
  },
  startOfTurn: (ctx) => {
    if (ctx.state.flow?.silentHills) {
      ctx.state.flow.silentHills = ctx.state.flow.silentHills.filter(
        (e: any) => !(e.siteId === ctx.sourceId && e.player === ctx.controller && e.turn < ctx.state.turn),
      )
    }
  },
})
