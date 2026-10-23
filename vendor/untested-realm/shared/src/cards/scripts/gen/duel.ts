import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { fightUnits } from '../../../engine/combat'
import { isDisabled } from '../../../engine/statics'
import { adjacentFightTargets, resolveAdjacentCombatants } from '../multi-card-utils/adjacent-fight'

// 'An ally fights target enemy adjacent to it.'
registerScript('Duel', {
  targets: adjacentFightTargets('your duelist'),
  onCast: (ctx) => {
    const pair = resolveAdjacentCombatants(ctx)
    if (!pair) return ctx.log('They are not adjacent.')
    const { a, b } = pair
    // the ALLY takes the fight; a disabled minion cannot take an action another card grants it (Codex)
    if (isDisabled(ctx.state, a)) return ctx.log(`${a.name} is disabled and cannot duel.`)
    // a forced fight: both strike simultaneously (firing every strike trigger — Interrogator, Lethal,
    // kill triggers…), nobody else may interfere. Adjacent, not co-located: fightUnits is position-agnostic.
    pushLog(ctx.state, ctx.controller, `${a.name} duels ${b.name}!`)
    fightUnits(ctx.state, a, b)
  },
})
