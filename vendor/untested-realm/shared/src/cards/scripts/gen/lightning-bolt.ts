import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { luckyChoiceIndex } from '../../../engine/effects'
import { awardAchievement } from '../../../engine/achievements.catalog'

// 'Deal 3 damage to a random unit at target location.'
registerScript('Lightning Bolt', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const region = t.square.region ?? ctx.caster!.region
    const units = unitsAt(ctx.state, t.square.x, t.square.y, region)
    // random unit at the location → Lucky Charm / Kythera may bend it
    const pick = ctx.lucky(units.map((u) => ({ label: u.name, payload: u.id })), 'bolt', 'cards')
    if (pick !== undefined) {
      const target = ctx.state.units[pick as string]
      const gambled = !!target?.isAvatar && target.controller !== ctx.controller && units.length > 1
      ctx.dealDamage({ unit: pick as string }, 3)
      // I guess you like gambling — the random bolt (2+ units on the square) picked the enemy Avatar and won
      if (gambled && ctx.state.winner === ctx.controller) awardAchievement(ctx.state, 'like-gambling', ctx.controller)
    }
  },
  conts: {
    bolt: (ctx, c, choice) => ctx.dealDamage({ unit: (c.__opts as string[])[luckyChoiceIndex(c, choice)] }, 3),
  },
})
