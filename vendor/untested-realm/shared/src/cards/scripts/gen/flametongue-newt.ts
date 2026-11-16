import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Once on your turn, may just for fun, shoot a projectile that deals damage 1.'
// "just for fun" is flavour: an activated ability with no cost, once per turn (abilities are only used on
// your own turn). The projectile flies in a chosen cardinal direction from the Newt, in its region.
registerScript('Flametongue Newt', {
  abilities: [{
    key: 'spit',
    label: 'Just for fun → spit fire (1 damage)',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Spit fire in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'spit')
    },
  }],
  conts: {
    spit: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof dir !== 'string') return
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir, volleys: 1, damage: 1, excludeId: self.id, shooterId: self.id, srcName: 'Flametongue Newt',
      })
    },
  },
})
