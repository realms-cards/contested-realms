import { type CardScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import { siteRarity } from '../../../engine/statics'
import { pushLog, killUnit } from '../../../engine/effects'
import { removeAura } from './remove-aura'

// Castle's Ablaze! / Hamlet's Ablaze! — conjured atop a site of a matching rarity; at the start of your
// turn it destroys that site, every minion atop it, and itself.
export function ablazeSite(opts: { name: string; rarities: string[]; rarityLabel: string; burnLog: string }): CardScript {
  const { name, rarities, rarityLabel, burnLog } = opts
  return {
    singleSiteAura: true, // covers the ONE site it's conjured atop, not a 2x2 region
    auraPlacement: (state, _player, at) => {
      const site = siteAt(state, at.x, at.y)
      if (!site) return `${name} must be conjured atop a site.`
      const rar = siteRarity(state, site) // rubble reads as Ordinary → not a legal target
      return rarities.includes(rar) ? null : `${name} must be conjured atop ${rarityLabel} site.`
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
      pushLog(ctx.state, ctx.controller, burnLog)
    },
  }
}
