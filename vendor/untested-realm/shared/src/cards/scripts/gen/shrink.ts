import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'Set the base power of target nearby unit to 0 until your next turn.'
registerScript('Shrink', {
  targets: [{ what: 'unit', count: 1, targeted: true, where: 'nearby', label: 'target nearby unit' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    ctx.addPower(u.id, -(getCard(u.name).attack ?? 0), 'permanent')
    const m = u.modifiers[u.modifiers.length - 1]
    if (m) m.duration = 'untilYourNextTurn' as any
    pushLog(ctx.state, ctx.controller, `${u.name} shrinks to a squeak.`)
  },
})
