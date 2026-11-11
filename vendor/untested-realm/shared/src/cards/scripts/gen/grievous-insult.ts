import { registerScript } from '../registry'
import { tapUnit } from '../../../engine/effects'
import { silenceImmune } from '../../../engine/statics'

// 'May be cast by any ally. Silence target nearby minion this turn and tap it. Draw a spell.'
// (timed silence: modeled as silence + auto-unsilence at end of turn via flow)
registerScript('Grievous Insult', {
  casterFilter: () => null,
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    // a Ward that broke on the target protects only the minion — the spell still draws (Codex Ward)
    const u = t && 'unit' in t ? ctx.state.units[t.unit] : undefined
    if (u) {
      // "can't be silenced" (an unmodifiable unit or an Onslaught'd ally) — still tapped, but not hushed.
      if (!silenceImmune(ctx.state, u)) {
        u.silenced = true
        ctx.state.flow = ctx.state.flow ?? {}
        ctx.state.flow.unsilenceAtEnd = [...(ctx.state.flow.unsilenceAtEnd ?? []), u.id]
      }
      tapUnit(ctx.state, u)
    }
    ctx.draw(ctx.controller, 'spellbook')
  },
})
