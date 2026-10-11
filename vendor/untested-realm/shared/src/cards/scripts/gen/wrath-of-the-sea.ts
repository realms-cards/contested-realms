import { registerScript } from '../registry'
import { getCard } from '../../db'
import { checkStateBased, trySubmerge, applyFlood } from '../../../engine/effects'
import { syncCarried, buryArtifactsAt } from '../../../engine/carrying'
import { isWaterSite, orthAdjacentWrapped, siteAt } from '../../../engine/grid'

// 'Flood all sites adjacent to a body of water this turn. Then submerge all
//  minions and artifacts on water.' (uses the canonical isWaterSite throughout)
registerScript('Wrath of the Sea', {
  onCast: (ctx) => {
    // flood every DRY site orthogonally adjacent to any water site — INCLUDING rubble, which floods into
    // water just like The Great Drowning of Men does (only already-water sites are skipped)
    const flooded: string[] = []
    for (const site of Object.values(ctx.state.sites)) {
      if (isWaterSite(ctx.state, site, getCard)) continue
      const nearWater = orthAdjacentWrapped(ctx.state, site.x, site.y).some((s) => {
        const o = siteAt(ctx.state, s.x, s.y)
        return !!o && isWaterSite(ctx.state, o, getCard)
      })
      if (nearWater && applyFlood(ctx.state, site, ctx.controller)) flooded.push(site.id)
    }
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.unfloodAtEnd = [...(ctx.state.flow.unfloodAtEnd ?? []), ...flooded]
    // submerge every surface minion standing on water (avatars can't submerge); its cargo rides down
    for (const u of Object.values(ctx.state.units)) {
      if (u.isAvatar || u.region !== 'surface') continue
      const site = siteAt(ctx.state, u.x, u.y)
      if (site && isWaterSite(ctx.state, site, getCard) && trySubmerge(ctx.state, u) && ctx.state.units[u.id]) syncCarried(ctx.state, u)
    }
    // submerge every surface artifact on water — loose ones AND ones carried by a bearer that stayed up
    // (an Avatar), which are detached and submerged on their own (mirrors Stormy Seas / Cave-In)
    for (const site of Object.values(ctx.state.sites)) {
      if (isWaterSite(ctx.state, site, getCard)) buryArtifactsAt(ctx.state, site.x, site.y, 'underwater')
    }
    checkStateBased(ctx.state)
  },
})
