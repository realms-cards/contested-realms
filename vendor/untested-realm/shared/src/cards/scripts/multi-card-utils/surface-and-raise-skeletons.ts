import { type CardScript } from '../registry'
import { getCard } from '../../db'
import { landSiteTargets, waterSiteTargets } from './site-terrain-targets'
import { isWaterSite, unitsAt } from '../../../engine/grid'
import { checkStateBased } from '../../../engine/effects'

// Exhume (land) / Dredge (water): bring everything at target site up to the surface from the matching
// subsurface region, then summon two Skeleton tokens there.
export function surfaceAndRaiseSkeletons(terrain: 'land' | 'water'): CardScript {
  const water = terrain === 'water'
  const sub = water ? 'underwater' : 'underground'
  return {
    targets: [{
      what: 'site', count: 1, targeted: true, label: `target ${terrain} site`,
      filter: (state, site) => water === isWaterSite(state, site, getCard),
    }],
    targetOptions: (state) => (water ? waterSiteTargets(state) : landSiteTargets(state)), // engine-authoritative glow
    onCast: (ctx) => {
      const t = ctx.targets[0]
      if (!('site' in t)) return
      const site = ctx.state.sites[t.site]
      if (!site) return
      for (const u of unitsAt(ctx.state, site.x, site.y, sub)) u.region = 'surface'
      for (const a of Object.values(ctx.state.artifacts)) {
        if (a.x === site.x && a.y === site.y && a.region === sub) a.region = 'surface'
      }
      ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)
      ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)
      checkStateBased(ctx.state)
    },
  }
}
