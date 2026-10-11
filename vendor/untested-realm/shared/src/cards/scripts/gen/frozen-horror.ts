import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Stealth / Break Stealth → Disable other nearby minions until your next turn.'
registerScript('Frozen Horror', {
  abilities: [{
    key: 'terror',
    label: 'Break Stealth → freeze everything nearby',
    cost: {},
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !self.stealth) return ctx.log('No Stealth to break.')
      self.stealth = false
      for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
        // nearby minion is region-locked to the source
        for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) {
          if (u.id !== self.id && !u.isAvatar) {
            u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: ctx.state.turn, sourcePlayer: ctx.controller })
          }
        }
      }
      pushLog(ctx.state, ctx.controller, 'A wave of paralyzing cold spreads.')
    },
  }],
})
