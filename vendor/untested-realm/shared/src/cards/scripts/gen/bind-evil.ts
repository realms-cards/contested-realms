import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Disable target nearby Evil minion until an adjacent Spellcaster taps to release it.'
registerScript('Bind Evil', {
  targets: [{
    what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby Evil minion',
    filter: (state, u) => isEvilU(state, u),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    u.disabled = true
    u.counters = { ...u.counters, bound: 1 }
    pushLog(ctx.state, ctx.controller, `${u.name} is bound in chains of faith.`)
    // The release ability (an adjacent Spellcaster or Avatar taps to free a `bound` minion) is surfaced
    // by the engine from the minion's counter — see grantedAbilities — because Bind Evil, a spell, is
    // already in the cemetery and can't grant abilities itself.
  },
})
