import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// "Deal 1 damage to each minion here. They're disabled until your next turn."
registerScript('Psionic Blast', {
  onCast: (ctx) => {
    const c = ctx.caster!
    for (const u of unitsAt(ctx.state, c.x, c.y, c.region)) {
      if (u.isAvatar) continue
      disableUntilYourNextTurn(ctx.state, u.id, ctx.controller)
      ctx.dealDamage({ unit: u.id }, 1)
    }
  },
})
