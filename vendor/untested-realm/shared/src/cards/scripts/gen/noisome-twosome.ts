import { registerScript } from '../registry'

// 'Deathrite → Summon a Skeleton token here.'
registerScript('Noisome Twosome', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) ctx.summonToken('Skeleton', ctx.controller, self.x, self.y)
  },
})
