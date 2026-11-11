import { registerScript } from '../registry'
import { killUnit, checkStateBased, toCemetery } from '../../../engine/effects'
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
        // everything there: loose artifacts (incl. those the dead dropped) AND what a surviving Avatar
        // carries — only the Avatar itself is protected (a carried artifact is at its bearer's location)
        for (const a of Object.values(ctx.state.artifacts)) {
          if (a.x === site.x && a.y === site.y && a.region !== 'void') ctx.breakArtifact(a.id)
        }
        // and every aura over the site (auras occupy the surface of sites)
        for (const r of Object.values(ctx.state.auras)) {
          if (!r.squares.some((q) => q.x === site.x && q.y === site.y)) continue
          const card = ctx.state.cards[r.cardId]
          if (card) toCemetery(ctx.state, card.id)
          delete ctx.state.auras[r.id]
        }
        ctx.destroySite(id)
      }
      checkStateBased(ctx.state)
    },
  },
})
