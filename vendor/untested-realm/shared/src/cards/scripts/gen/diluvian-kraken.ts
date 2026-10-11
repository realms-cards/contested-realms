import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { checkStateBased } from '../../../engine/effects'
import { strikeOnce } from '../multi-card-utils/strike-once'

// 'Submerge / Tap â†’ Surface to strike each other unit nearby.'
registerScript('Diluvian Kraken', {
  abilities: [{
    key: 'surface',
    label: 'Tap â†’ Surface and thrash everything nearby',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      self.region = 'surface'
      for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
        for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) {
          if (u.id !== self.id && ctx.state.units[self.id]) strikeOnce(ctx, self, u.id)
        }
      }
      checkStateBased(ctx.state)
    },
  }],
})
