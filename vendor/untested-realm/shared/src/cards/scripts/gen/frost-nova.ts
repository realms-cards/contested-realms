import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// "Freeze nearby enemy minions. They're disabled until your next turn."
registerScript('Frost Nova', {
  onCast: (ctx) => {
    const c = ctx.caster!
    for (const sq of nearbySquaresW(ctx.state, c.x, c.y)) {
      // nearby minion is region-locked to the source
      for (const u of unitsAt(ctx.state, sq.x, sq.y, c.region)) {
        if (!u.isAvatar && u.controller !== ctx.controller) {
          u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: ctx.state.turn, sourcePlayer: ctx.controller })
        }
      }
    }
    ctx.log('Enemy minions nearby freeze solid.')
  },
})
