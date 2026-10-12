import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Genesis → Shoot a projectile that deals 1 damage, or gain Spellcaster this turn.'
registerScript('One-shot Wizard', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'One-shot Wizard:', data: { options: ['shoot (1 dmg)', 'gain Spellcaster this turn'] } }, 'oneshot')
  },
  conts: {
    oneshot: (ctx, _c, choice) => {
      if (choice === 'gain Spellcaster this turn') {
        ctx.grantKeyword(ctx.sourceId, 'spellcaster', 'endOfTurn')
        return
      }
      ctx.ask({ kind: 'chooseOption', title: 'Shoot in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'pew')
    },
    pew: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !dir) return
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir: String(dir), volleys: 1, damage: 1, excludeId: self.id, srcName: 'One-shot Wizard',
      })
    },
  },
})
