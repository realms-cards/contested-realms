import { registerScript } from '../registry'
import { pushLog, wardUnit } from '../../../engine/effects'

// 'Ward an allied minion. Until your next turn, it takes damage for its nearby
//  allies instead.'
registerScript('Enduring Faith', {
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    wardUnit(ctx.state, u)
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.enduringFaith = [
      ...(ctx.state.flow.enduringFaith ?? []),
      { unitId: u.id, player: ctx.controller, turn: ctx.state.turn },
    ]
    pushLog(ctx.state, ctx.controller, `${u.name} stands as a bulwark for the faithful.`)
  },
})
