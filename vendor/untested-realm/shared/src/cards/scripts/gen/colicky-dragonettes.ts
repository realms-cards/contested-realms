import { registerScript } from '../registry'
import { fireVolleyProjectiles, volleyDirectionMatters } from '../../../engine/combat'

// 'At the end of your turn, Colicky Dragonettes shoot a projectile. It deals 1 damage.'
registerScript('Colicky Dragonettes', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    // Every direction hits the same thing (an enemy on their own square, or nothing in reach): no choice to make.
    if (self && !volleyDirectionMatters(ctx.state, { player: ctx.controller, ox: self.x, oy: self.y, region: self.region, volleys: 1, damage: 1, excludeId: self.id, srcName: 'Colicky Dragonettes' })) {
      self.interactedTurn = ctx.state.turn
      fireVolleyProjectiles(ctx.state, { player: ctx.controller, ox: self.x, oy: self.y, region: self.region, dir: 'n', volleys: 1, damage: 1, excludeId: self.id, shooterId: self.id, srcName: 'Colicky Dragonettes' })
      return
    }
    ctx.ask({ kind: 'chooseOption', title: 'Colicky Dragonettes hiccup a fireball -- which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'hiccup')
  },
  conts: {
    hiccup: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !dir) return
      // firing interacts with the realm (no Drop this turn), but Stealth is only lost if the fireball
      // hits a unit (applyVolleyHit) — a miss deals no damage, so an Infiltrated Dragonettes stays yours
      self.interactedTurn = ctx.state.turn
      fireVolleyProjectiles(ctx.state, {
        player: ctx.controller, ox: self.x, oy: self.y, region: self.region,
        dir: String(dir), volleys: 1, damage: 1, excludeId: self.id, shooterId: self.id, srcName: 'Colicky Dragonettes',
      })
    },
  },
})
