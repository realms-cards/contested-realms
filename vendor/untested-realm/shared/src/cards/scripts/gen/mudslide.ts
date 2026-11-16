import { registerScript } from '../registry'
import { getCard } from '../../db'
import { inBounds, isWaterSite, siteAt } from '../../../engine/grid'
import { pushLog, checkStateBased, emitUnitMoved, moveProtected } from '../../../engine/effects'

// 'Genesis → Slide all units at land sites in this column one step left or right.'
registerScript('Mudslide', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Mudslide: slide the column which way?', data: { options: ['left', 'right'] } }, 'slide')
  },
  conts: {
    slide: (ctx, _c, choice) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      const dx = choice === 'left' ? -1 : 1
      for (const u of Object.values(ctx.state.units)) {
        if (u.x !== self.x) continue
        const site = siteAt(ctx.state, u.x, u.y)
        if (!site || isWaterSite(ctx.state, site, getCard)) continue
        if (!inBounds(u.x + dx, u.y)) continue
        // Mudslide's column spans the void, but a forced "one step" is to an adjacent location in the
        // same region (Windblast FAQ: you can't push something into the void), so a unit only
        // slides onto another site; with the void beside it, it stays put.
        if (!siteAt(ctx.state, u.x + dx, u.y)) continue
        if (moveProtected(ctx.state, u, ctx.controller)) continue // "can't be moved by force"
        const from = { x: u.x, y: u.y, region: u.region }
        u.x += dx
        emitUnitMoved(ctx.state, u, from) // a forced slide "enters" its new square — fire on-enter triggers
      }
      checkStateBased(ctx.state)
      pushLog(ctx.state, ctx.controller, 'The ground gives way!')
    },
  },
})
