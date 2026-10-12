import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { dealDamageToUnit } from '../../../engine/effects'

// 'Lethal / Deal 1 damage to each other nearby minion.'
registerScript('Poison Nova', {
  onCast: (ctx) => {
    const c = ctx.caster!
    for (const sq of nearbySquaresW(ctx.state, c.x, c.y)) {
      for (const u of unitsAt(ctx.state, sq.x, sq.y, c.region)) {
        if (!u.isAvatar && u.id !== c.id) {
          // tag as MAGIC damage so magic-immune units (Failed Mutation) are spared
          dealDamageToUnit(ctx.state, u, 1, ctx.controller, { lethal: true, source: { player: ctx.controller, kind: 'magic', name: 'Poison Nova' } })
        }
      }
    }
  },
})
