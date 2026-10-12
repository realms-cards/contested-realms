import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'Whenever a minion is summoned nearby, tap it.'
registerScript('Winter Nymph', {
  onUnitEnters: (ctx, entered) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || entered.isAvatar || entered.id === self.id || entered.enteredTurn !== ctx.state.turn) return
    if (nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === entered.x && s.y === entered.y)) {
      entered.tapped = true
      pushLog(ctx.state, ctx.controller, `${entered.name} arrives frostbitten and numb.`)
    }
  },
})
