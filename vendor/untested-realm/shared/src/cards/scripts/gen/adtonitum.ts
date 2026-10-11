import { registerScript } from '../registry'
import { luckyChoiceIndex } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Whenever Adtonitum stops, she may deal 3 damage to another random unit there.'
registerScript('Adtonitum', {
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId) return
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const others = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.id !== self.id)
    if (!others.length) return
    ctx.ask({ kind: 'yesNo', title: 'Adtonitum: unleash 3 damage on a random unit here?' }, 'crackle')
  },
  conts: {
    crackle: (ctx, _c, yes) => {
      if (!yes) return
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const others = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.id !== self.id)
      if (!others.length) return
      // random target → Kythera/Black Cat (choose any) or Lucky Charm (roll N+1, choose)
      const pick = ctx.lucky(others.map((u) => ({ label: u.name, payload: u.id })), 'zap', 'cards')
      if (pick !== undefined && ctx.state.units[pick as string]) ctx.dealDamage({ unit: pick as string }, 3)
    },
    zap: (ctx, c, choice) => {
      const id = (c.__opts as string[])[luckyChoiceIndex(c, choice)]
      if (typeof id === 'string' && ctx.state.units[id]) ctx.dealDamage({ unit: id }, 3)
    },
  },
})
