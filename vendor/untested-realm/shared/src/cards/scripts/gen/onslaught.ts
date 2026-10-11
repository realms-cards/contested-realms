import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// "This turn, allies gain +1 power, Charge, and can't be immobilized, silenced, or disabled."
// All three immunities are granted as endOfTurn keyword modifiers read by statics:
// `unimmobilizable` → effKeywords strips Immobile (printed Immobile on Pudge Butcher too, so it can
// move this turn); `unsilenceable` → silence effects don't land; `undisableable` → disable checks skip it.
registerScript('Onslaught', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller !== ctx.controller) continue
      ctx.addPower(u.id, 1, 'endOfTurn')
      ctx.grantKeyword(u.id, 'charge', 'endOfTurn')
      ctx.grantKeyword(u.id, 'unimmobilizable', 'endOfTurn')
      ctx.grantKeyword(u.id, 'unsilenceable', 'endOfTurn')
      ctx.grantKeyword(u.id, 'undisableable', 'endOfTurn')
    }
    pushLog(ctx.state, ctx.controller, 'ONSLAUGHT!')
  },
})
