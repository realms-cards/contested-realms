import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Charge / If Redcap Powries haven't attacked by the end of your turn, they die.'
registerScript('Redcap Powries', {
  afterAttack: (ctx, attacker) => {
    attacker.counters = { ...attacker.counters, attackedTurn: ctx.state.turn }
  },
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    if (self.counters?.attackedTurn !== ctx.state.turn) {
      pushLog(ctx.state, ctx.controller, 'Denied their violence, the Redcap Powries turn on themselves.')
      ctx.kill(self.id)
    }
  },
})
