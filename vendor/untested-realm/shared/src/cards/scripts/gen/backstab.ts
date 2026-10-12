import { registerScript } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { emitUnitMoved } from '../../../engine/effects'
import { strikeOnce } from '../multi-card-utils/strike-once'

// 'Target minion moves to an adjacent location, if needed, to strike another target tapped minion there.'
registerScript('Backstab', {
  targets: [
    { what: 'minion', count: 1, targeted: true, label: 'target minion (the striker)' },
    { what: 'minion', count: 1, targeted: true, label: 'target tapped minion', filter: (s, u) => u.tapped },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!('unit' in t1) || !('unit' in t2)) return
    const striker = ctx.state.units[t1.unit]
    const victim = ctx.state.units[t2.unit]
    if (!striker || !victim || !victim.tapped) return
    const together = striker.x === victim.x && striker.y === victim.y && striker.region === victim.region
    const adjacent = adjacentSquaresW(ctx.state, striker.x, striker.y).some((s) => s.x === victim.x && s.y === victim.y)
    if (!together) {
      if (!adjacent) return ctx.log('The minions are not adjacent.')
      // "moves to an adjacent location … to strike" is a STEP — if it can't (Immobile / wall / entry-ban)
      // it can't reach, so no strike happens.
      const from = { x: striker.x, y: striker.y, region: striker.region }
      const to = { x: victim.x, y: victim.y, region: victim.region }
      if (!isLegalStep(ctx.state, striker, from, to)) return ctx.log("The striker can't reach.")
      striker.x = victim.x; striker.y = victim.y; striker.region = victim.region
      emitUnitMoved(ctx.state, striker, from)
    }
    if (ctx.state.units[striker.id]) strikeOnce(ctx, striker, victim.id)
  },
})
