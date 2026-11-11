import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { CROSS_3X3, applyGrid } from '../multi-card-utils/apply-grid'

// "Airborne, can't attack or defend. At the start of your turn, each OTHER unit
// at affected locations takes damage: [3 5 3 / 5 7 5 / 3 5 3]"
registerScript('Hellstar', {
  cantDefendEver: true, // "can't defend" at all — not only "can't MOVE to defend" (Skeleton)
  // Intercept is its own basic ability, not named here (contrast Lumbering Giant's "can't defend or intercept")
  cantAttackSites: true, // it can't attack at all — the UI also blocks unit attacks below
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    applyGrid(ctx, self, CROSS_3X3, 'n', { skipUnitId: self.id })
    pushLog(ctx.state, ctx.controller, 'The Hellstar sears the firmament.')
  },
})
