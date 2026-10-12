import { registerScript, type EffectAPI } from '../registry'
import { pushLog, applyFlood, siteStillFlooded } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Submerge / This site is flooded. It is a water site.' (while the Naiads stand there)
registerScript('Tide Naiads', {
  genesis: (ctx) => naiadFlood(ctx),
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id === ctx.sourceId) naiadFlood(ctx)
  },
  // NB: no deathrite — the card has none. Draining the flooded site when the Naiads LEAVE the realm is
  // handled centrally in removeUnitFromRealm (so it fires on any exit and doesn't log a phantom rite).
})

function naiadFlood(ctx: EffectAPI): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  // the old puddle drains
  naiadEbb(ctx)
  const site = siteAt(ctx.state, self.x, self.y)
  if (!site) return
  const wasFlooded = !!site.flooded
  // claim the site while the Naiads stand here EVEN if another source flooded it first — so that source
  // leaving (or a second Naiads here) doesn't wrongly drain it (siteStillFlooded reads the claim).
  if (wasFlooded || applyFlood(ctx.state, site, ctx.controller)) {
    self.counters = { ...self.counters, naiadSite: Number(site.id.slice(1)) }
    if (!wasFlooded) pushLog(ctx.state, ctx.controller, `${site.name} floods around the Tide Naiads.`)
  }
}

// drain the site the Naiads previously flooded once they've moved off it (unless another source still floods it)
function naiadEbb(ctx: EffectAPI): void {
  const self = ctx.state.units[ctx.sourceId]
  const prev = self?.counters?.naiadSite
  if (prev === undefined) return
  const site = ctx.state.sites[`s${prev}`]
  if (site && (site.x !== self!.x || site.y !== self!.y)) {
    // leave it flooded if another source still floods it (a second Naiads, Waveshaper, Floodplain…)
    site.flooded = siteStillFlooded(ctx.state, site.id, { excludeUnit: self!.id })
    delete self!.counters!.naiadSite
  }
}
