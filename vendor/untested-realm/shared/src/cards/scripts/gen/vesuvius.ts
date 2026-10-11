import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'

// '(F)(F)(F) — Sacrifice Vesuvius → Each unit occupying nearby sites takes 3 damage.'
registerScript('Vesuvius', {
  abilities: [{
    key: 'erupt',
    label: 'Sacrifice → 3 damage to each unit on nearby sites',
    cost: {},
    threshold: { fire: 3 },
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
        if (!siteAt(ctx.state, sq.x, sq.y)) continue
        for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) {
          if (u.isAvatar && u.controller !== ctx.controller) awardAchievement(ctx.state, 'cleanse-with-fire', ctx.controller)
          ctx.dealDamage({ unit: u.id }, 3)
        }
      }
      ctx.destroySite(self.id, undefined, true) // Vesuvius SACRIFICES itself (a cost, not destruction)
      pushLog(ctx.state, ctx.controller, '🌋 Vesuvius erupts!')
    },
  }],
})
