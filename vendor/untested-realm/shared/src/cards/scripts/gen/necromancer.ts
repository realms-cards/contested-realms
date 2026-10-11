import { registerScript } from '../registry'

// 'Once on your turn, you may pay (1) to summon a Skeleton token here.' (avatar)
registerScript('Necromancer', {
  abilities: [{
    key: 'raise',
    label: '① → Summon a Skeleton here',
    cost: { mana: 1 },
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (self) ctx.summonToken('Skeleton', ctx.controller, self.x, self.y)
    },
  }],
})
