import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Draw a card for each Unique ally.'
registerScript("King's Council", {
  onCast: (ctx) => {
    let n = 0
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller === ctx.controller && !u.isAvatar && getCard(u.name).rarity === 'Unique') n++
    }
    if (n > 0) ctx.drawCard(ctx.controller, n)
  },
})
