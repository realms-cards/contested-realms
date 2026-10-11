import { registerScript } from '../registry'
import { effAttack } from '../../../engine/statics'

// "Whenever a weaker allied minion here is attacked, you may return it to its
//  owner's hand."
registerScript('Witherwing Hero', {
  onUnitAttacked: (ctx, target) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || target.isAvatar || target.id === self.id || target.controller !== ctx.controller) return
    if (target.x !== self.x || target.y !== self.y || target.region !== self.region) return
    if (effAttack(ctx.state, target) >= effAttack(ctx.state, self)) return
    ctx.ask({ kind: 'yesNo', title: `Witherwing Hero: whisk ${target.name} back to hand?` }, 'whisk', { unitId: target.id })
  },
  conts: {
    whisk: (ctx, c, yes) => {
      if (yes && ctx.state.units[c.unitId as string]) ctx.bounce(c.unitId as string)
    },
  },
})
