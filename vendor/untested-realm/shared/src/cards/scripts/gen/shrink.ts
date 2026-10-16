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
    const def = getCard(u.name)
    // "base power" = the unit's printed power. An Animist Spirit has no printed power — its base power
    // IS its mana cost (granted as a modifier when it took Spirit form), so count that too; otherwise
    // Shrink subtracts 0 and the Spirit keeps its full power (reported bug). External buffs are left
    // intact (we only cancel the intrinsic base), matching "set BASE power to 0".
    let base = def.attack ?? 0
    if (u.counters?.animistSpirit) base += def.cost ?? 0
    ctx.addPower(u.id, -base, 'permanent')
    const m = u.modifiers[u.modifiers.length - 1]
    if (m) m.duration = 'untilYourNextTurn' as any
    pushLog(ctx.state, ctx.controller, `${u.name} shrinks to a squeak.`)
  },
})
