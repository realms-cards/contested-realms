import { registerScript } from '../registry'
import { pushLog, killUnit, checkStateBased, toCemetery } from '../../../engine/effects'
import { siteAt, unitsAt } from '../../../engine/grid'

// 'At the start of your turn, destroy affected sites and everything here,
//  including Year of the Blaze.'
registerScript('Year of the Blaze', {
  startOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    for (const sq of aura.squares) {
      // "everything here" is the aura's SURFACE layer (like Wildfire) — a burrowed/submerged minion
      // under an affected site isn't consumed by the blaze (it only deals with the site turning to
      // rubble via normal state-based rules).
      for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) {
        if (!u.isAvatar) killUnit(ctx.state, u.id)
      }
      for (const a of Object.values(ctx.state.artifacts)) {
        if (!a.carriedBy && a.x === sq.x && a.y === sq.y) ctx.breakArtifact(a.id)
      }
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site && !site.isRubble) ctx.destroySite(site.id)
    }
    const card = ctx.state.cards[aura.cardId]
    if (card) toCemetery(ctx.state, card.id)
    delete ctx.state.auras[ctx.sourceId]
    pushLog(ctx.state, null, '🔥 The Year of the Blaze consumes everything — itself included.')
    checkStateBased(ctx.state)
  },
})
