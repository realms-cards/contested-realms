import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Must be summoned to your location. / Automatically follows you and can't
//  move itself away.'
registerScript('Cerberus in Chains', {
  summonFilter: (state, player, at) => {
    const avatar = Object.values(state.units).find((u) => u.isAvatar && u.controller === player)
    return avatar && avatar.x === at.x && avatar.y === at.y ? null : 'Cerberus must be summoned to your location.'
  },
  summonAnywhere: true,
  stepFilter: () => false, // can't move itself
  onUnitEntersSquare: (ctx, moved) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !moved.isAvatar || moved.controller !== ctx.controller) return
    if (self.x !== moved.x || self.y !== moved.y) {
      ctx.teleport(self.id, moved.x, moved.y, moved.region)
      pushLog(ctx.state, ctx.controller, 'Cerberus pads along at its master’s heel.')
    }
  },
})
