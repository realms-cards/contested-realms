import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Voidwalk / You may cast minions to this void, granting them Voidwalk until
//  they're no longer in the void.'
registerScript('Lucid Dreamers', {
  allowsSummonHere: true,
  grantsKeywords: (state, self, other) => {
    if (self.region !== 'void') return []
    return other.region === 'void' && other.counters?.lucidDream ? ['voidwalk'] : []
  },
  onUnitEnters: (ctx, entered) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.region !== 'void' || entered.id === self.id) return
    if (entered.controller !== ctx.controller || entered.enteredTurn !== ctx.state.turn) return
    if (entered.x === self.x && entered.y === self.y && entered.region === 'void') {
      entered.counters = { ...entered.counters, lucidDream: 1 }
      pushLog(ctx.state, ctx.controller, `${entered.name} walks the dreamers' dream.`)
    }
  },
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.region !== 'void' && moved.counters?.lucidDream) delete moved.counters.lucidDream
  },
})
