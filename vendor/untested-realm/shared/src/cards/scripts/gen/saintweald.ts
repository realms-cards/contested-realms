import { registerScript, getScript } from '../registry'
import { pushLog, makeCtx } from '../../../engine/effects'
import { abilitiesOff } from '../../../engine/statics'

// 'Deathrite abilities here are also Genesis abilities.'
registerScript('Saintweald', {
  onUnitEnters: (ctx, entered) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || entered.isAvatar) return
    // a unit that enters BECAUSE of an echoed rite (Nosferatu resummoning himself) isn't echoed again
    if (ctx.state.flow?.riteEcho) return
    if (entered.x !== self.x || entered.y !== self.y || entered.enteredTurn !== ctx.state.turn) return
    const rite = getScript(entered.name)?.deathrite
    if (rite && !abilitiesOff(ctx.state, entered)) {
      pushLog(ctx.state, entered.controller, `The Saintweald echoes ${entered.name}'s last rite as a first rite.`)
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.riteEcho = entered.id // the rite runs as a Genesis: nothing died (Nosferatu reads this)
      try { rite(makeCtx(ctx.state, entered.id, entered.controller, [])) } finally { delete ctx.state.flow.riteEcho }
    }
  },
})
