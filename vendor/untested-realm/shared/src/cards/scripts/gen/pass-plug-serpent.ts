import { registerScript, type EffectAPI } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import type { SiteState, UnitState } from '../../../engine/types'

// 'Burrowing / Whenever an enemy enters the surface of a nearby allied site, if the Serpent is
// underground, it may unburrow there.'
// Entering covers moving onto that surface and being summoned atop it. "There" is that site's surface.
/** the Serpent can come up at `site`: it's underground, and the site is allied and nearby it */
function canPlug(ctx: EffectAPI, site: SiteState | undefined): site is SiteState {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || self.region !== 'underground' || !site || site.controller !== ctx.controller) return false
  return nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === site.x && s.y === site.y)
}

function plugAsk(ctx: EffectAPI, enemy: UnitState): void {
  if (enemy.controller === ctx.controller || enemy.region !== 'surface') return
  const site = siteAt(ctx.state, enemy.x, enemy.y) ?? undefined
  if (!canPlug(ctx, site)) return
  ctx.ask({ kind: 'yesNo', title: `Pass-plug Serpent: unburrow at ${site.name} to meet ${enemy.name}?` }, 'unburrow', { x: site.x, y: site.y, siteId: site.id })
}

registerScript('Pass-plug Serpent', {
  // fires for a move AND for a summon onto the site (emitUnitEnters also raises it, after Genesis)
  onUnitEntersSquare: (ctx, moved) => plugAsk(ctx, moved),
  conts: {
    unburrow: (ctx, c, yes) => {
      const site = ctx.state.sites[c.siteId as string]
      // re-checked at the answer: still underground, the site still allied, nearby and where it was
      if (!yes || !canPlug(ctx, site) || site.x !== c.x || site.y !== c.y) return
      if (ctx.teleport(ctx.sourceId, site.x, site.y, 'surface')) ctx.log('The Serpent bursts up through the pass!')
    },
  },
})
