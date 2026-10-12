import { registerScript } from '../registry'

// 'Whenever an enemy unit enters or leaves this site, it takes 1 damage.'
registerScript('Briar Patch', {
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || moved.controller === self.controller) return
    const entered = moved.x === self.x && moved.y === self.y
    const left = from.x === self.x && from.y === self.y
    if (entered || left) ctx.dealDamage({ unit: moved.id }, 1)
  },
})
