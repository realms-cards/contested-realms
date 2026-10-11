import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'Fully heal each Avatar.'
registerScript('Lifewish', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar || u.deathsDoor) continue
      const max = u.counters?.maxLife ?? getCard(u.name).life ?? 20
      u.life = max
      pushLog(ctx.state, ctx.controller, `${u.name} is fully healed (${max}).`)
    }
  },
})
