import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'
import { breakStealth } from '../../../engine/combat'

// 'At the end of your turn, deal 3 damage to each other adjacent unit.'
registerScript('Infernal Legion', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    let attempted = false
    for (const sq of adjacentSquaresW(ctx.state, self.x, self.y)) {
      for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) {
        if (u.id !== self.id) { ctx.dealDamage({ unit: u.id }, 3); attempted = true }
      }
    }
    // attempting to deal damage is interacting with the realm → a stealthed Legion is revealed,
    // even if the damage is wholly prevented (e.g. by Tufted Turtles).
    if (attempted) breakStealth(ctx.state, self)
  },
})
