import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'Whenever another nearby minion dies, Squirming Mass permanently gains its power.'
registerScript('Squirming Mass', {
  onAnyDeath: (ctx, dead) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || dead.isAvatar || dead.id === self.id) return
    if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === dead.x && s.y === dead.y)) return
    const gained = getCard(dead.name).attack ?? 0
    if (gained > 0) {
      ctx.addPower(self.id, gained, 'permanent')
      pushLog(ctx.state, ctx.controller, `The Squirming Mass absorbs ${dead.name} (+${gained}).`)
    }
  },
})
