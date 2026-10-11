import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// "Halve each Avatar's maximum life."
registerScript('Deathwish', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar) continue
      const currentMax = u.counters?.maxLife ?? getCard(u.name).life ?? 20
      const newMax = Math.floor(currentMax / 2)
      u.counters = { ...u.counters, maxLife: newMax }
      if ((u.life ?? 0) > newMax) u.life = newMax
      pushLog(ctx.state, ctx.controller, `${u.name}'s maximum life is now ${newMax}.`)
    }
  },
})
