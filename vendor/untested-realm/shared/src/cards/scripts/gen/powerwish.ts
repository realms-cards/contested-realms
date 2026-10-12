import { registerScript } from '../registry'
import { killUnit, checkStateBased } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Each Avatar sacrifices all of their minions, permanently gaining +1 power for each.'
registerScript('Powerwish', {
  onCast: (ctx) => {
    const counts: Record<number, number> = { 0: 0, 1: 0 }
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar) {
        counts[u.controller]++
        killUnit(ctx.state, u.id)
      }
    }
    for (const pid of [0, 1] as PlayerId[]) {
      const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === pid)
      if (avatar && counts[pid] > 0) ctx.addPower(avatar.id, counts[pid], 'permanent')
    }
    checkStateBased(ctx.state)
  },
})
