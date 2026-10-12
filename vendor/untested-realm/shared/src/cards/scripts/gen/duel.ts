import { registerScript } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import { fightUnits } from '../../../engine/combat'

// 'An ally fights target enemy adjacent to it.'
registerScript('Duel', {
  // "an ally" / "target enemy" (not "minion") — both may be Avatars
  targets: [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'your duelist' },
    { what: 'unit', count: 1, targeted: true, owner: 'enemy', label: 'target adjacent enemy' },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!('unit' in t1) || !('unit' in t2)) return
    const a = ctx.state.units[t1.unit]
    const b = ctx.state.units[t2.unit]
    if (!a || !b) return
    if (!adjacentSquaresW(ctx.state, a.x, a.y).some((s) => s.x === b.x && s.y === b.y) || a.region !== b.region) {
      return ctx.log('They are not adjacent.')
    }
    // a forced fight: both strike simultaneously (firing every strike trigger — Interrogator, Lethal,
    // kill triggers…), nobody else may interfere. Adjacent, not co-located: fightUnits is position-agnostic.
    pushLog(ctx.state, ctx.controller, `${a.name} duels ${b.name}!`)
    fightUnits(ctx.state, a, b)
  },
})
