import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import { siteRarity } from '../../../engine/statics'
import { pushLog, killUnit } from '../../../engine/effects'
import { removeAura } from '../multi-card-utils/remove-aura'

// "Hamlet's Ablaze!" — same behavior as Castle's Ablaze!
registerScript("Hamlet's Ablaze!", {
  singleSiteAura: true, // covers the ONE site it's conjured atop, not a 2x2 region
  auraPlacement: (state, _player, at) => {
    const site = siteAt(state, at.x, at.y)
    if (!site) return "Hamlet's Ablaze! must be conjured atop a site."
    const rar = siteRarity(state, site) // rubble reads as Ordinary
    return rar === 'Ordinary' || rar === 'Exceptional' ? null : "Hamlet's Ablaze! must be conjured atop an Ordinary or Exceptional site."
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
    removeAura(ctx)
    pushLog(ctx.state, ctx.controller, 'The hamlet burns to ash!')
  },
})
