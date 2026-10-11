import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { canRespond, payResponse } from '../multi-card-utils/response'

// 'May be cast when an ally defends a site or another unit. The ally gains +4
//  power this turn.'
registerScript('Valor', {
  listensFromHand: true,
  onAllyDefends: (ctx, defender) => {
    if (!defender || defender.controller !== ctx.controller) return
    if (!canRespond(ctx, ctx.sourceId)) return
    ctx.ask(
      { kind: 'yesNo', title: `${defender.name} stands to defend — cast Valor (+4 power)?`, player: ctx.controller },
      'valor',
      { defenderId: defender.id },
    )
  },
  conts: {
    valor: (ctx, c, yes) => {
      if (!yes || !payResponse(ctx, ctx.sourceId)) return
      const u = ctx.state.units[c.defenderId as string]
      if (u) {
        ctx.addPower(u.id, 4, 'endOfTurn')
        pushLog(ctx.state, ctx.controller, `${u.name} fights with the strength of heroes!`)
      }
    },
  },
})
