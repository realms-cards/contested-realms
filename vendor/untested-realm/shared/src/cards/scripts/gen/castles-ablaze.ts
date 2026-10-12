import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import { siteRarity } from '../../../engine/statics'
import { pushLog, killUnit, toCemetery } from '../../../engine/effects'

// "Conjure atop an Elite or Unique site. / At the start of your turn, destroy
// this site, minions atop it, and Castle's Ablaze."
registerScript("Castle's Ablaze!", {
  singleSiteAura: true, // covers the ONE site it's conjured atop, not a 2x2 region
  auraPlacement: (state, _player, at) => {
    const site = siteAt(state, at.x, at.y)
    if (!site) return "Castle's Ablaze! must be conjured atop a site."
    const rar = siteRarity(state, site) // rubble is Ordinary → not a legal target
    return rar === 'Elite' || rar === 'Unique' ? null : "Castle's Ablaze! must be conjured atop an Elite or Unique site."
  },
  startOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura || !aura.squares.length) return
    const sq = aura.squares[0]
    for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) {
      if (!u.isAvatar) killUnit(ctx.state, u.id)
    }
    const site = siteAt(ctx.state, sq.x, sq.y)
    if (site) ctx.destroySite(site.id)
    const card = ctx.state.cards[aura.cardId]
    if (card) toCemetery(ctx.state, card.id)
    delete ctx.state.auras[aura.id]
    pushLog(ctx.state, ctx.controller, 'The castle burns to the ground!')
  },
})
