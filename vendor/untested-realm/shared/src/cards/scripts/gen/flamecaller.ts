import { registerScript } from '../registry'
import { getCard } from '../../db'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Tap, Banish all your dead fire minions â†’ Shoot a projectile. It deals damage
// equal to the sum of their (F).'
registerScript('Flamecaller', {
  abilities: [{
    key: 'pyre',
    label: 'Tap â†’ Banish dead fire minions, shoot flame',
    cost: { tap: true },
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: 'Shoot the flame in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'flame')
    },
  }],
  conts: {
    flame: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !dir) return
      const p = ctx.state.players[ctx.controller]
      let total = 0
      p.cemetery = p.cemetery.filter((id) => {
        const def = getCard(ctx.state.cards[id].name)
        if (def.type === 'Minion' && def.elements.includes('Fire')) {
          total += def.thresholds.fire
          p.banished.push(id)
          return false
        }
        return true
      })
      if (total === 0) return ctx.log('No dead fire minions to burn.')
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir: String(dir), volleys: 1, damage: total, filter: 'notStealth', excludeId: self.id, srcName: 'Flamecaller',
      })
    },
  },
})
