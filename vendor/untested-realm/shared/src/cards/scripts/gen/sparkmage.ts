import { registerScript } from '../registry'
import { pushLog, luckyChoiceIndex } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Tap → Target nearby location. Deal damage to another random unit there equal
//  to the sum of (A) on spells you've cast this turn.'
registerScript('Sparkmage', {
  abilities: [{
    key: 'spark',
    label: 'Zap a random unit at a nearby location',
    cost: { tap: true },
    targets: [{ what: 'square', count: 1, targeted: true, where: 'nearby', label: 'target nearby location' }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (!t || !('square' in t)) return
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const dmg = ctx.state.flow?.airCastSum?.[ctx.controller] ?? 0
      if (dmg <= 0) return ctx.log('No Air thresholds cast this turn — the spark fizzles.')
      const sq = t.square
      const candidates = unitsAt(ctx.state, sq.x, sq.y, sq.region ?? 'surface').filter((u) => u.id !== self.id)
      if (!candidates.length) return ctx.log('No other unit there.')
      // random target → Kythera/Black Cat (choose any) or Lucky Charm (roll N+1, choose)
      const pick = ctx.lucky(candidates.map((u) => ({ label: u.name, payload: u.id })), 'zap', 'cards', { dmg })
      if (pick !== undefined) {
        const victim = ctx.state.units[pick as string]
        if (victim) {
          ctx.dealDamage({ unit: victim.id }, dmg)
          pushLog(ctx.state, ctx.controller, `The spark arcs into ${victim.name} for ${dmg}.`)
        }
      }
    },
  }],
  conts: {
    zap: (ctx, c, choice) => {
      const id = (c.__opts as string[])[luckyChoiceIndex(c, choice)]
      const victim = typeof id === 'string' ? ctx.state.units[id] : null
      if (victim) {
        ctx.dealDamage({ unit: victim.id }, c.dmg as number)
        pushLog(ctx.state, ctx.controller, `The spark arcs into ${victim.name} for ${c.dmg}.`)
      }
    },
  },
})
