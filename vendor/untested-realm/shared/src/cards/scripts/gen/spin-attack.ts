import { registerScript } from '../registry'
import { strikeAllSimultaneous } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// ---------- magics ----------

// 'An ally strikes each enemy at its location.'
registerScript('Spin Attack', {
  // "an ally" (not "an allied minion") — so it may target your Avatar too
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const ally = ctx.state.units[t.unit]
    if (!ally) return
    const foes = unitsAt(ctx.state, ally.x, ally.y, ally.region).filter((u) => u.controller !== ally.controller).map((u) => u.id)
    strikeAllSimultaneous(ctx.state, ally.id, foes, ctx.controller) // controller chooses strike order
  },
})
