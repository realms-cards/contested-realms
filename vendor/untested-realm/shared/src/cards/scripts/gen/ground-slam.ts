import { registerScript } from '../registry'
import { nearbySquaresW, occupiedSquares, siteAt, unitsAt } from '../../../engine/grid'
import type { EffectAPI } from '../registry'
import type { GameState, SiteState, UnitState } from '../../../engine/types'

// 'An ally strikes its site. Deal 2 damage to other units at nearby sites.'
// "An ally" isn't targeting (any unit you control, your Avatar included). It strikes a site it stands on,
// so it must be on the surface (units interact with "the surface of … sites", rulebook); one spanning
// several sites chooses which. The 2 damage reaches the other units at every site nearby the struck
// site (its own included), in the ally's region — once per unit.
function sitesUnder(state: GameState, u: UnitState): SiteState[] {
  if (u.region !== 'surface') return []
  return occupiedSquares(u).map((q) => siteAt(state, q.x, q.y)).filter((s): s is SiteState => !!s)
}

registerScript('Ground Slam', {
  targets: [{
    what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally on a site',
    filter: (state, u) => sitesUnder(state, u as UnitState).length > 0,
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    const ally = t && 'unit' in t ? ctx.state.units[t.unit] : undefined
    const sites = ally ? sitesUnder(ctx.state, ally) : []
    if (!ally || !sites.length) return ctx.log('No site beneath them.')
    if (sites.length === 1) return slam(ctx, ally, sites[0])
    ctx.ask({ kind: 'chooseTargets', title: 'Ground Slam: strike which of its sites?', data: { candidates: sites.map((s) => s.id), count: 1, kind: 'site', notTargeted: true, upTo: false } }, 'site', { allyId: ally.id })
  },
  conts: {
    site: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const ally = ctx.state.units[c.allyId as string]
      const site = ally ? sitesUnder(ctx.state, ally).find((s) => s.id === id) : undefined
      if (ally && site) slam(ctx, ally, site)
    },
  },
})

function slam(ctx: EffectAPI, ally: UnitState, site: SiteState): void {
  const { x, y } = site
  const region = ally.region
  ctx.strike(ally, { site: site.id })
  // 2 to each other unit once, however many nearby sites it spans
  const hit = new Set<string>()
  for (const sq of nearbySquaresW(ctx.state, x, y)) {
    if (!siteAt(ctx.state, sq.x, sq.y)) continue
    for (const u of unitsAt(ctx.state, sq.x, sq.y, region)) if (u.id !== ally.id) hit.add(u.id)
  }
  for (const id of hit) ctx.dealDamage({ unit: id }, 2)
}
