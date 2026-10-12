import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'

// "Deathrite â†’ If you control another Mortal, return Crown Prince to its owner's hand."
registerScript('Crown Prince', {
  deathrite: (ctx) => {
    const hasMortal = Object.values(ctx.state.units).some(
      (u) => u.id !== ctx.sourceId && u.controller === ctx.controller && !u.isAvatar && hasSubtype(ctx.state, u, 'Mortal'),
    )
    if (hasMortal) ctx.bounce(ctx.sourceId)
  },
})
