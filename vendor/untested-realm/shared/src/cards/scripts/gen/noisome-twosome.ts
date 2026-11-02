import { registerScript } from '../registry'

// 'Deathrite → Summon a Skeleton token here.'
registerScript('Noisome Twosome', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    // "here" is where it died, region included — buried (Cave-In) or submerged, the Skeleton rises down there
    if (self) ctx.summonToken('Skeleton', ctx.controller, self.x, self.y, self.region)
  },
})
