import { registerScript } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Summon a Foot Soldier token to each site near your Avatar.'
registerScript('Guards!', {
  onCast: (ctx) => {
    const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
    if (!avatar) return
    for (const sq of nearbySquaresW(ctx.state, avatar.x, avatar.y)) {
      if (siteAt(ctx.state, sq.x, sq.y)) ctx.summonToken('Foot Soldier', ctx.controller, sq.x, sq.y)
    }
  },
})
