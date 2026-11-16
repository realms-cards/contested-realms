import { registerScript } from '../registry'
import { drawLocked } from '../multi-card-utils/draw-locked'

// 'Spellcaster / Genesis → Draws his own spell, which only he can cast.'
// Morgana's mechanic with one spell: the Runeling casts it with his own (printed) Spellcaster ability.
registerScript('Runeling', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    drawLocked(ctx, self.id, 'the Runeling')
  },
})
