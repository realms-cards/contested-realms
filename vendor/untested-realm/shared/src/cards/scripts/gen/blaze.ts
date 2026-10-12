import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'This turn, give an ally Movement +2, it can't be intercepted, and it leaves
//  a trail of fire at departed locations. When it stops, each unit along the
//  trail takes 2 damage.'
registerScript('Blaze', {
  // "an ally" (not "an allied minion") — so it may target your Avatar too
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    ctx.grantKeyword(u.id, 'movement +2', 'endOfTurn')
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.noIntercept = [...(ctx.state.flow.noIntercept ?? []), { unitId: u.id, turn: ctx.state.turn }]
    ctx.state.flow.blazeTrail = [...(ctx.state.flow.blazeTrail ?? []), { unitId: u.id, turn: ctx.state.turn, squares: [] }]
    pushLog(ctx.state, ctx.controller, `${u.name} bursts into flame and RUNS.`)
  },
})
