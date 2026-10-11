import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'May be cast by any ally. / Strike target adjacent enemy. If it's Evil, banish it instead.'
registerScript('Smite', {
  casterFilter: () => null, // any ally may cast it
  targets: [{ what: 'unit', count: 1, targeted: true, where: 'adjacent', owner: 'enemy', label: 'target adjacent enemy' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    const caster = ctx.caster!
    if (!t || !('unit' in t)) return
    const foe = ctx.state.units[t.unit]
    if (!foe) return
    if (!foe.isAvatar && isEvilU(ctx.state, foe)) {
      ctx.banish(foe.id)
      pushLog(ctx.state, ctx.controller, `${foe.name} is smitten from the realm!`)
    } else {
      ctx.strike(caster, { unit: foe.id })
    }
  },
})
