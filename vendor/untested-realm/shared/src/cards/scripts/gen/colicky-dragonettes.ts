import { registerScript } from '../registry'
import { fireVolleyProjectiles, breakStealth } from '../../../engine/combat'

// 'At the end of your turn, Colicky Dragonettes shoot a projectile. It deals 1 damage.'
registerScript('Colicky Dragonettes', {
  endOfTurn: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Colicky Dragonettes hiccup a fireball -- which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'hiccup')
  },
  conts: {
    hiccup: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !dir) return
      breakStealth(ctx.state, self) // firing the projectile reveals them — they lose Stealth
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir: String(dir), volleys: 1, damage: 1, filter: 'notStealth', excludeId: self.id, srcName: 'Colicky Dragonettes',
      })
    },
  },
})
