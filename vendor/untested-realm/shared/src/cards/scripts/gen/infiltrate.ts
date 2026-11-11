import { registerScript } from '../registry'
import { tapUnit } from '../../../engine/effects'
import { isUnmodifiable } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'
import { takeControl } from '../multi-card-utils/take-control'

// 'UPDATED: Target enemy minion gains Stealth and taps. You control it until it
// no longer has Stealth.'
registerScript('Infiltrate', {
  targets: [{ what: 'minion', count: 1, targeted: true, owner: 'enemy', label: 'target enemy minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    tapUnit(ctx.state, u)
    // Stealth is an ability: a minion that can't be modified (Monks of Kobalsa) can't gain it, and the
    // control lasts only "until it no longer has Stealth" — so it never starts
    if (isUnmodifiable(ctx.state, u)) return
    u.stealth = true
    takeControl(ctx.state, u, ctx.controller)
    if (u.controller !== ctx.controller) return // King Arthur kept it with its owner
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.infiltrations = [...(ctx.state.flow.infiltrations ?? []), { unitId: u.id, to: (1 - ctx.controller) as PlayerId }]
  },
})
