import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Airborne, Ward / Tap → Shoot a projectile that deals 4 damage.'
registerScript('Cherubim', {
  abilities: [{
    key: 'bolt',
    label: 'Tap → Shoot a 4-damage bolt',
    cost: { tap: true },
    effect: (ctx) => ctx.ask({ kind: 'chooseOption', title: 'Shoot in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'bolt'),
  }],
  conts: {
    bolt: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !dir) return
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir: String(dir), volleys: 1, damage: 4, excludeId: self.id, srcName: self.name,
      })
    },
  },
})
