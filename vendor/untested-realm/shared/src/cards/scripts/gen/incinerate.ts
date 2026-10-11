import { registerScript, type TargetRef } from '../registry'
import { chebyshevW, unitsAt, GRID_W, GRID_H } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'

// 'Deal 4 damage to each other unit at target location near the caster or an allied Dragon.'
registerScript('Incinerate', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location near you or an allied Dragon' }],
  // engine-authoritative legal set: squares "nearby" (chebyshev ≤1) the caster OR any allied Dragon.
  // A multi-anchor range the plain TargetSpec can't express, so the client consults this to highlight
  // exactly the reachable locations and castSpell rejects anything outside it.
  targetOptions: (state, caster) => {
    const anchors = [caster, ...Object.values(state.units).filter((u) => u.controller === caster.controller && hasSubtype(state, u, 'Dragon'))]
    const out: TargetRef[] = []
    for (let x = 0; x < GRID_W; x++)
      for (let y = 0; y < GRID_H; y++)
        if (anchors.some((a) => chebyshevW(state, a, { x, y }) <= 1)) out.push({ square: { x, y } })
    return out
  },
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const caster = ctx.caster!
    const anchors = [caster, ...Object.values(ctx.state.units).filter((u) => u.controller === ctx.controller && hasSubtype(ctx.state, u, 'Dragon'))]
    if (!anchors.some((a) => chebyshevW(ctx.state, a, t.square) <= 1)) return ctx.log('Not near the caster or an allied Dragon.')
    const region = t.square.region ?? caster.region
    for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
      if (u.id !== caster.id) ctx.dealDamage({ unit: u.id }, 4)
    }
  },
})
