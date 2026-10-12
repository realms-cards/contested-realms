import { registerScript } from '../registry'
import { bodyOfWater } from '../multi-card-utils/body-of-water'

// 'Each ally heals an amount equal to the number of sites in its body of water.'
registerScript('Font of Life', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller !== ctx.controller) continue
      const size = bodyOfWater(ctx.state, u.x, u.y).size
      if (size <= 0) continue
      if (u.isAvatar) ctx.gainLife(ctx.controller, size)
      else ctx.heal(u.id, size)
    }
  },
})
