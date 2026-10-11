import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'

// 'Summon a Skeleton token to each other site adjacent to target enemy.'
registerScript('Undead Ambush', {
  targets: [{ what: 'unit', count: 1, targeted: true, owner: 'enemy', label: 'target enemy' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const foe = ctx.state.units[t.unit]
    if (!foe) return
    for (const sq of orthAdjacentWrapped(ctx.state, foe.x, foe.y)) {
      if (siteAt(ctx.state, sq.x, sq.y)) ctx.summonToken('Skeleton', ctx.controller, sq.x, sq.y)
    }
    pushLog(ctx.state, ctx.controller, `Bones burst from the ground around ${foe.name}!`)
  },
})
