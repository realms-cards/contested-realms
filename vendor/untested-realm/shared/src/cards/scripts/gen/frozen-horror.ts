import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'
import { breakStealthAbility } from '../multi-card-utils/break-stealth'

// 'Stealth / Break Stealth → Disable other nearby minions until your next turn.'
registerScript('Frozen Horror', {
  abilities: [breakStealthAbility('terror', 'freeze everything nearby', (ctx, self) => {
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      // nearby minion is region-locked to the source
      for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) {
        if (u.id !== self.id && !u.isAvatar) disableUntilYourNextTurn(ctx.state, u.id, ctx.controller)
      }
    }
    pushLog(ctx.state, ctx.controller, 'A wave of paralyzing cold spreads.')
  })],
})
