import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effAttack } from '../../../engine/statics'

// "This turn, double an allied minion's power, and whenever it attacks and
//  kills a unit, it untaps. At the end of the turn, it dies."
registerScript('Warp Spasm', {
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    ctx.addPower(u.id, effAttack(ctx.state, u), 'endOfTurn')
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.untapOnKill = [...(ctx.state.flow.untapOnKill ?? []), { unitId: u.id, turn: ctx.state.turn }]
    ctx.state.flow.dieAtEnd = [...(ctx.state.flow.dieAtEnd ?? []), { unitId: u.id, turn: ctx.state.turn }]
    pushLog(ctx.state, ctx.controller, `${u.name} contorts into a monstrous warp spasm!`)
  },
})
