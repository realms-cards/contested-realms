import { registerScript, getScript } from '../registry'
import { pushLog, makeCtx } from '../../../engine/effects'

// 'Deathrite abilities here are also Genesis abilities.'
registerScript('Saintweald', {
  onUnitEnters: (ctx, entered) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || entered.isAvatar) return
    if (entered.x !== self.x || entered.y !== self.y || entered.enteredTurn !== ctx.state.turn) return
    const rite = getScript(entered.name)?.deathrite
    if (rite && !entered.silenced) {
      pushLog(ctx.state, entered.controller, `The Saintweald echoes ${entered.name}'s last rite as a first rite.`)
      rite(makeCtx(ctx.state, entered.id, entered.controller, []))
    }
  },
})
