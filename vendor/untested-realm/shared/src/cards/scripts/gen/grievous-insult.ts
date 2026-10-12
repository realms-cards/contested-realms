import { registerScript } from '../registry'
import { silenceImmune } from '../../../engine/statics'

// 'May be cast by any ally. Silence target nearby minion this turn and tap it. Draw a spell.'
// (timed silence: modeled as silence + auto-unsilence at end of turn via flow)
registerScript('Grievous Insult', {
  casterFilter: () => null,
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    // "can't be silenced" (an unmodifiable unit or an Onslaught'd ally) — still tapped, but not hushed.
    if (!silenceImmune(ctx.state, u)) {
      u.silenced = true
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.unsilenceAtEnd = [...(ctx.state.flow.unsilenceAtEnd ?? []), u.id]
    }
    u.tapped = true
    ctx.draw(ctx.controller, 'spellbook')
  },
})
