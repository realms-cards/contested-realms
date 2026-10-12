import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// "Deal 1 damage to each minion here. They're disabled until your next turn."
registerScript('Psionic Blast', {
  onCast: (ctx) => {
    const c = ctx.caster!
    for (const u of unitsAt(ctx.state, c.x, c.y, c.region)) {
      if (u.isAvatar) continue
      u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: ctx.state.turn, sourcePlayer: ctx.controller })
      ctx.dealDamage({ unit: u.id }, 1)
    }
  },
})
