import { registerScript } from '../registry'
import { killUnit, checkStateBased } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Choose any number of sites you control. Destroy each of those sites and everything there.'
registerScript('Scorched Earth', {
  onCast: (ctx) => {
    const mine = Object.values(ctx.state.sites).filter((s) => s.controller === ctx.controller && !s.isRubble).map((s) => s.id)
    if (!mine.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Scorch which of your sites?', data: { candidates: mine, count: mine.length, upTo: true, kind: 'site' } }, 'scorch')
  },
  conts: {
    scorch: (ctx, _c, choice) => {
      const ids = Array.isArray(choice) ? choice : []
      for (const id of ids) {
        const site = ctx.state.sites[id]
        if (!site || site.controller !== ctx.controller) continue
        for (const u of unitsAt(ctx.state, site.x, site.y)) {
          if (!u.isAvatar) killUnit(ctx.state, u.id)
        }
        for (const a of Object.values(ctx.state.artifacts)) {
          if (!a.carriedBy && a.x === site.x && a.y === site.y) ctx.breakArtifact(a.id)
        }
        ctx.destroySite(id)
      }
      checkStateBased(ctx.state)
    },
  },
})
