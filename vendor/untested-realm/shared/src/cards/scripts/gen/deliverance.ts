import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Banish all nearby Evil.'
registerScript('Deliverance', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    for (const sq of nearbySquaresW(ctx.state, caster.x, caster.y)) {
      for (const u of unitsAt(ctx.state, sq.x, sq.y)) {
        if (!u.isAvatar && isEvilU(ctx.state, u)) ctx.banish(u.id)
      }
    }
  },
})
