import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// "Damage dealt to units by Hemogolem's strikes heals you, but damage it takes
//  is dealt to you as well." (an automaton — the golem itself strikes)
registerScript('Hemogolem', {
  onUnitDamaged: (ctx, victim, amount, source) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // the golem's strike connected: drink the blood
    if (source?.kind === 'strike' && source.attackerId === self.id && victim.id !== self.id) {
      ctx.gainLife(ctx.controller, amount)
      pushLog(ctx.state, ctx.controller, `The Hemogolem feeds you ${amount} life.`)
      return
    }
    // the golem bled: so do you
    if (victim.id === self.id) {
      ctx.loseLife(ctx.controller, amount)
      pushLog(ctx.state, ctx.controller, `The Hemogolem shares its wounds with you (${amount}).`)
    }
  },
})
