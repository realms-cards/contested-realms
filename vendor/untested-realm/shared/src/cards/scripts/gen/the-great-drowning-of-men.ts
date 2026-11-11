import { registerScript } from '../registry'
import { pushLog, applyFlood, toCemetery } from '../../../engine/effects'
import { siteAt, unitsAt } from '../../../engine/grid'
import { submergeOrDrown } from '../multi-card-utils/submerge-or-drown'

// 'At the start of your turn, destroy affected sites and flood the resulting
//  Rubble. Submerge everything atop them and dispel The Great Drowning of Men.'
registerScript('The Great Drowning of Men', {
  startOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    // destroy ALL the affected sites first, then flood and submerge — not square by square, so a minion
    // drowning here finds every affected site already Rubble (Bladderblimp's Deathrite counting sites)
    for (const sq of aura.squares) {
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site && !site.isRubble) ctx.destroySite(site.id)
    }
    for (const sq of aura.squares) {
      const rubble = siteAt(ctx.state, sq.x, sq.y)
      // Bedrock survives the destroy and won't flood; only actually-flooded squares drown/submerge.
      if (rubble && applyFlood(ctx.state, rubble, ctx.controller)) {
        for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) submergeOrDrown(ctx, u)
        for (const a of Object.values(ctx.state.artifacts)) {
          if (!a.carriedBy && a.x === sq.x && a.y === sq.y && a.region === 'surface') a.region = 'underwater'
        }
      }
    }
    const card = ctx.state.cards[aura.cardId]
    if (card) toCemetery(ctx.state, card.id)
    delete ctx.state.auras[ctx.sourceId]
    pushLog(ctx.state, null, 'The waters rise and swallow the works of men.')
  },
})
