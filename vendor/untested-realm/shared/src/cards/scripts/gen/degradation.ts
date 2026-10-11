import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'
import { pushLog, removeUnitFromRealm } from '../../../engine/effects'

// 'Transform a Mortal into a Foot Soldier token.'
registerScript('Degradation', {
  targets: [{
    what: 'minion', count: 1, targeted: false, label: 'a Mortal',
    filter: (state, u) => hasSubtype(state, u, 'Mortal'),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    const { x, y, region, controller, enteredTurn } = u
    if (removeUnitFromRealm(ctx.state, u.id)) delete ctx.state.units[u.id] // cargo stays behind; an avatar refuses removal
    pushLog(ctx.state, ctx.controller, `${u.name} is degraded to a mere Foot Soldier.`)
    const token = ctx.summonToken('Foot Soldier', controller, x, y, region)
    if (token) token.enteredTurn = enteredTurn
  },
})
