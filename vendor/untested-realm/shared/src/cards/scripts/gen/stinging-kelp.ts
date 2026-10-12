import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { bodyOfWaterCells } from '../multi-card-utils/body-of-water'

// 'Genesis → Deal 1 damage to each minion at target site in this body of water.'
registerScript('Stinging Kelp', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const body = bodyOfWaterCells(ctx.state, self.x, self.y)
    if (!body.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'The kelp stings which site in this body of water?', data: { squares: body } }, 'sting')
  },
  conts: {
    sting: (ctx, _c, sq) => {
      if (!sq) return
      for (const u of unitsAt(ctx.state, sq.x, sq.y)) {
        if (!u.isAvatar) ctx.dealDamage({ unit: u.id }, 1)
      }
    },
  },
})
