import { registerScript } from '../registry'

// 'Spellcaster / Genesis → Summon a Skeleton token here.'
registerScript('Novice Necromancer', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) ctx.summonToken('Skeleton', ctx.controller, self.x, self.y)
  },
})
