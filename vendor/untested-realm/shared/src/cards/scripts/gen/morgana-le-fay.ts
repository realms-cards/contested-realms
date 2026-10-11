import { registerScript } from '../registry'
import { drawLocked } from '../multi-card-utils/draw-locked'

// 'Genesis → Morgana draws her own hand of three spells, which only she can cast.'
registerScript('Morgana le Fay', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (let i = 0; i < 3; i++) drawLocked(ctx, self.id, 'Morgana')
  },
})
